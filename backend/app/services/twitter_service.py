import os
import subprocess
import tempfile
import uuid
import requests
import json
from typing import Tuple, Optional, List
from PIL import Image
import cv2


class TwitterService:
    """Service for downloading media from Twitter/X links"""

    @staticmethod
    def normalize_twitter_url(url: str) -> str:
        """
        Normalize various Twitter URL formats to a standard format.

        Handles:
        - x.com / twitter.com
        - URLs with query parameters or fragments
        - Direct image URLs (i.twitter.com, pbs.twimg.com)
        - Mobile URLs (mobile.twitter.com)

        Args:
            url: Any Twitter/X URL

        Returns:
            Normalized Twitter post URL
        """
        import re
        from urllib.parse import urlparse, parse_qs

        # If it's a direct image URL, we can't get the tweet - raise error
        if 'pbs.twimg.com' in url or 'i.twitter.com' in url or 'video.twimg.com' in url:
            # Try to extract tweet ID from the URL if present in referrer or path
            # Otherwise, we can't process direct media URLs
            raise ValueError("Direct image/video URLs are not supported. Please provide the tweet URL instead.")

        # Parse the URL
        parsed = urlparse(url)

        # Replace x.com or any twitter domain with twitter.com
        domain = 'twitter.com'

        # Extract path - remove query params and fragments
        path = parsed.path

        # Remove trailing slashes and clean up
        path = path.rstrip('/')

        # Match Twitter post URL pattern: /username/status/1234567890
        # Also handle /i/web/status/1234567890 (from x.com)
        match = re.search(r'/(?:i/web/)?status/(\d+)', path)
        if not match:
            # Try to find username/status pattern
            match = re.search(r'/([^/]+)/status/(\d+)', path)
            if match:
                username = match.group(1)
                status_id = match.group(2)
                return f"https://{domain}/{username}/status/{status_id}"
            else:
                # URL doesn't contain a status ID
                raise ValueError(f"Invalid Twitter URL format. Could not find status ID in: {url}")

        status_id = match.group(1)

        # For /i/web/status/ format, we need to get the username differently
        # But yt-dlp and gallery-dl can handle status ID alone
        return f"https://{domain}/i/web/status/{status_id}"

    @staticmethod
    def _download_image_from_url(image_url: str, temp_dir: str, filename: str) -> str:
        """
        Download an image directly from a URL.

        Args:
            image_url: Direct URL to the image
            temp_dir: Temporary directory to save the image
            filename: Name for the saved file

        Returns:
            Path to the downloaded file
        """
        response = requests.get(image_url, stream=True)
        response.raise_for_status()

        file_path = os.path.join(temp_dir, filename)
        with open(file_path, 'wb') as f:
            for chunk in response.iter_content(chunk_size=8192):
                f.write(chunk)

        return file_path

    @staticmethod
    def get_tweet_text(url: str) -> Optional[str]:
        """
        Extract the tweet text from a Twitter URL.

        Args:
            url: Twitter/X URL

        Returns:
            Tweet text if found, None otherwise
        """
        try:
            # Use gallery-dl to dump JSON metadata
            cmd = [
                'gallery-dl',
                '--dump-json',
                url
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0 and result.stdout:
                # Parse the JSON output - gallery-dl outputs one JSON object per line
                for line in result.stdout.strip().split('\n'):
                    line = line.strip()
                    if not line or not line.startswith('{'):
                        continue

                    try:
                        data = json.loads(line)

                        # Try different field names that gallery-dl might use
                        tweet_text = (
                            data.get('content') or
                            data.get('description') or
                            data.get('text') or
                            data.get('tweet', {}).get('full_text') or
                            data.get('tweet', {}).get('text')
                        )

                        if tweet_text and isinstance(tweet_text, str):
                            print(f"Successfully extracted tweet text: {tweet_text[:100]}...")
                            return TwitterService.clean_tweet_text(tweet_text)
                    except json.JSONDecodeError as je:
                        # Skip this line if it's not valid JSON
                        continue

            # If gallery-dl didn't work, try yt-dlp
            print("gallery-dl didn't return tweet text, trying yt-dlp...")
            cmd = [
                'yt-dlp',
                '--dump-json',
                '--skip-download',
                url
            ]

            result = subprocess.run(cmd, capture_output=True, text=True, timeout=10)

            if result.returncode == 0 and result.stdout:
                try:
                    data = json.loads(result.stdout)
                    tweet_text = data.get('description') or data.get('title')
                    if tweet_text and isinstance(tweet_text, str):
                        print(f"Successfully extracted tweet text via yt-dlp: {tweet_text[:100]}...")
                        return TwitterService.clean_tweet_text(tweet_text)
                except json.JSONDecodeError:
                    pass

        except subprocess.TimeoutExpired:
            print("Tweet text extraction timed out")
        except Exception as e:
            print(f"Failed to extract tweet text: {e}")

        return None

    @staticmethod
    def clean_tweet_text(text: str) -> str:
        """
        Clean up tweet text by removing t.co links and HTML entities.

        Args:
            text: Raw tweet text

        Returns:
            Cleaned tweet text
        """
        import re
        import html

        if not text:
            return text

        # Decode HTML entities (e.g., &gt; -> >, &lt; -> <, &amp; -> &)
        text = html.unescape(text)

        # Remove t.co shortened links
        text = re.sub(r'https?://t\.co/\w+', '', text)

        # Remove any standalone pic.twitter.com links
        text = re.sub(r'https?://pic\.twitter\.com/\w+', '', text)

        # Clean up extra whitespace
        text = re.sub(r'\s+', ' ', text)
        text = text.strip()

        return text

    @staticmethod
    def download_from_twitter(url: str) -> List[Tuple[str, str, str, Optional[str]]]:
        """
        Download media from a Twitter/X URL.

        Returns:
            List of tuples: [(file_path, file_type, content_type, tweet_text), ...]
            - file_path: Path to the downloaded file
            - file_type: "image" or "video"
            - content_type: MIME type of the file
            - tweet_text: Text of the tweet (if available)

        Raises:
            Exception if download fails
        """
        try:
            # Normalize the URL first
            url = TwitterService.normalize_twitter_url(url)
            print(f"Normalized Twitter URL: {url}")

            # First, try to get the tweet text
            tweet_text = TwitterService.get_tweet_text(url)
            print(f"Extracted tweet text: {tweet_text[:100] if tweet_text else 'None'}...")

            # Create a temporary directory for the download
            temp_dir = tempfile.mkdtemp()
            output_template = os.path.join(temp_dir, 'twitter_download.%(ext)s')

            # First, try to download video/gif
            cmd = [
                'yt-dlp',
                '--no-playlist',
                '-f', 'best',
                '--output', output_template,
                '--no-warnings',
                url
            ]

            result = subprocess.run(cmd, capture_output=True, text=True)

            # Check if it failed because there's no video (likely an image tweet)
            if result.returncode != 0 and "No video" in result.stderr:
                print("No video found, trying gallery-dl for images...")

                # Try using gallery-dl which is better for images
                # -D: set base directory (same as --dest)
                # Use {num} in filename to support multiple images
                cmd = [
                    'gallery-dl',
                    '-D', temp_dir,
                    '--filename', 'twitter_download_{num}.{extension}',
                    url
                ]

                gallery_result = subprocess.run(cmd, capture_output=True, text=True)
                print(f"gallery-dl stdout: {gallery_result.stdout}")
                print(f"gallery-dl stderr: {gallery_result.stderr}")
                print(f"gallery-dl return code: {gallery_result.returncode}")

                # Check if gallery-dl actually downloaded files (regardless of return code)
                all_files = os.listdir(temp_dir)
                print(f"Files in temp_dir after gallery-dl: {all_files}")

                gallery_files = [f for f in all_files if f.startswith('twitter_download')]

                if gallery_files:
                    # gallery-dl succeeded in downloading
                    print(f"gallery-dl downloaded files: {gallery_files}")
                    result = gallery_result  # Use gallery-dl result
                    result.returncode = 0  # Mark as success
                elif gallery_result.returncode != 0:
                    # gallery-dl failed and no files were downloaded, try yt-dlp with different options
                    print(f"gallery-dl failed (rc={gallery_result.returncode}), trying yt-dlp with thumbnail extraction...")

                    cmd = [
                        'yt-dlp',
                        '--no-playlist',
                        '--write-thumbnail',
                        '--skip-download',
                        '--convert-thumbnails', 'jpg',
                        '--output', output_template,
                        '--no-warnings',
                        url
                    ]

                    result = subprocess.run(cmd, capture_output=True, text=True)
                else:
                    # gallery-dl succeeded but downloaded files we don't recognize
                    print("gallery-dl succeeded but no twitter_download files found")
                    result = gallery_result
                    result.returncode = 0

            if result.returncode != 0:
                error_msg = result.stderr if result.stderr else result.stdout
                print(f"All methods failed. Final error: {error_msg}")
                raise Exception(f"Failed to download media: {error_msg}")

            print(f"Final result output: {result.stdout}")

            # Find the downloaded file (including in subdirectories created by gallery-dl)
            downloaded_files = []

            # Walk through all subdirectories to find media files
            for root, dirs, files in os.walk(temp_dir):
                for file in files:
                    if file.startswith('twitter_download') or \
                       any(file.endswith(ext) for ext in ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.mp4', '.mov']):
                        full_path = os.path.join(root, file)
                        downloaded_files.append(full_path)

            if not downloaded_files:
                all_files = []
                for root, dirs, files in os.walk(temp_dir):
                    for file in files:
                        all_files.append(os.path.join(root, file))
                raise Exception(f"No media file was downloaded from the Twitter link. Files found: {all_files}")

            print(f"Downloaded files found: {downloaded_files}")

            # Prefer non-thumbnail files, but accept thumbnails if that's all we have
            main_files = [f for f in downloaded_files if not any(x in f for x in ['.webp', 'thumbnail'])]
            if not main_files:
                main_files = downloaded_files  # Use thumbnails if that's all we have

            # Sort files by their numeric index (twitter_download_1, twitter_download_2, etc.)
            def get_file_index(filepath):
                import re
                # Extract number from filename like "twitter_download_2.png"
                basename = os.path.basename(filepath)
                match = re.search(r'_(\d+)\.', basename)
                if match:
                    return int(match.group(1))
                return 0  # Files without numbers go first

            main_files.sort(key=get_file_index)
            print(f"Sorted files: {main_files}")

            # Process all files and return them
            results = []
            for downloaded_file in main_files:
                print(f"Processing file: {downloaded_file}")

                file_ext = downloaded_file.split('.')[-1].lower()

                # Determine file type and content type
                video_extensions = ['mp4', 'mov', 'avi', 'webm', 'mkv']
                image_extensions = ['jpg', 'jpeg', 'png', 'gif', 'webp']

                if file_ext in video_extensions:
                    file_type = "video"
                    content_type = f"video/{file_ext}"
                elif file_ext in image_extensions:
                    file_type = "image"
                    if file_ext == 'jpg' or file_ext == 'jpeg':
                        content_type = "image/jpeg"
                    else:
                        content_type = f"image/{file_ext}"
                else:
                    print(f"Skipping unsupported file type: {file_ext}")
                    continue

                results.append((downloaded_file, file_type, content_type, tweet_text))

            if not results:
                raise Exception("No supported media files were found")

            print(f"Returning {len(results)} file(s)")
            return results

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr if e.stderr else str(e)
            raise Exception(f"Failed to download from Twitter: {error_msg}")
        except Exception as e:
            raise Exception(f"Twitter download error: {str(e)}")

    @staticmethod
    def convert_mp4_to_gif(mp4_path: str) -> str:
        """
        Convert an MP4 file to a GIF with loop support.

        Args:
            mp4_path: Path to the MP4 file

        Returns:
            Path to the generated GIF file
        """
        try:
            # Generate output path
            output_path = mp4_path.rsplit('.', 1)[0] + '.gif'

            # Use ffmpeg to convert MP4 to GIF
            # -i: input file
            # -vf: video filters
            #   - fps=15: limit to 15 fps for smaller file size
            #   - scale=width:height: scale to reasonable size, maintaining aspect ratio
            #   - split/palettegen/paletteuse: generate and use a color palette for better quality
            # -loop 0: infinite loop
            cmd = [
                'ffmpeg',
                '-i', mp4_path,
                '-vf', 'fps=15,scale=640:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse',
                '-loop', '0',
                '-y',  # Overwrite output file
                output_path
            ]

            subprocess.run(cmd, check=True, capture_output=True)
            print(f"Successfully converted MP4 to GIF: {output_path}")

            return output_path

        except subprocess.CalledProcessError as e:
            error_msg = e.stderr.decode() if e.stderr else str(e)
            raise Exception(f"Failed to convert MP4 to GIF: {error_msg}")
        except Exception as e:
            raise Exception(f"MP4 to GIF conversion error: {str(e)}")

    @staticmethod
    def get_media_dimensions(file_path: str, file_type: str) -> Tuple[int, int]:
        """
        Get the dimensions of a media file.

        Args:
            file_path: Path to the media file
            file_type: "image" or "video"

        Returns:
            Tuple of (width, height)
        """
        try:
            if file_type == "image":
                with Image.open(file_path) as img:
                    return img.size
            else:  # video
                video = cv2.VideoCapture(file_path)
                width = int(video.get(cv2.CAP_PROP_FRAME_WIDTH))
                height = int(video.get(cv2.CAP_PROP_FRAME_HEIGHT))
                video.release()
                return width, height
        except Exception as e:
            print(f"Failed to get media dimensions: {e}")
            return 200, 200  # Default fallback
