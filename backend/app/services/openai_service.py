import base64
from typing import List
from openai import OpenAI
from PIL import Image
import io
from app.core.config import settings

client = OpenAI(api_key=settings.OPENAI_API_KEY)


class OpenAIService:
    @staticmethod
    def scale_image_if_needed(image_path: str, max_dimension: int = 400) -> tuple[bytes, str]:
        """
        Scale image if width or height exceeds max_dimension.
        Returns tuple of (image_bytes, mime_type).
        If scaled, returns JPEG. Otherwise returns original.
        """
        img = Image.open(image_path)
        width, height = img.size

        # Check if scaling is needed
        if width <= max_dimension and height <= max_dimension:
            # No scaling needed, return original with its mime type
            ext = image_path.split(".")[-1].lower()
            mime_type_map = {
                'jpg': 'image/jpeg',
                'jpeg': 'image/jpeg',
                'png': 'image/png',
                'gif': 'image/gif',
                'webp': 'image/webp'
            }
            mime_type = mime_type_map.get(ext, 'image/png')

            with open(image_path, "rb") as f:
                return f.read(), mime_type

        # Calculate new dimensions maintaining aspect ratio
        if width > height:
            new_width = max_dimension
            new_height = int(height * (max_dimension / width))
        else:
            new_height = max_dimension
            new_width = int(width * (max_dimension / height))

        # Resize image
        img_resized = img.resize((new_width, new_height), Image.LANCZOS)

        # Convert to RGB if necessary (for PNG with transparency, etc.)
        if img_resized.mode in ('RGBA', 'LA', 'P'):
            background = Image.new('RGB', img_resized.size, (255, 255, 255))
            if img_resized.mode == 'P':
                img_resized = img_resized.convert('RGBA')
            background.paste(img_resized, mask=img_resized.split()[-1] if img_resized.mode in ('RGBA', 'LA') else None)
            img_resized = background
        elif img_resized.mode != 'RGB':
            img_resized = img_resized.convert('RGB')

        # Save to bytes as JPEG
        buffer = io.BytesIO()
        img_resized.save(buffer, format='JPEG', quality=85)
        return buffer.getvalue(), 'image/jpeg'
    @staticmethod
    async def generate_caption_from_video_frames(frame_paths: List[str], file_type: str) -> dict:
        """
        Use OpenAI Vision API to generate name, description, and searchable caption
        from multiple video frames.
        """
        # Scale and encode all frames to base64
        image_contents = []
        for i, frame_path in enumerate(frame_paths):
            scaled_image_bytes, mime_type = OpenAIService.scale_image_if_needed(frame_path)
            image_data = base64.b64encode(scaled_image_bytes).decode("utf-8")
            image_contents.append({
                "type": "image_url",
                "image_url": {
                    "url": f"data:{mime_type};base64,{image_data}"
                }
            })

        prompt = f"""You are analyzing a video reaction clip. You are seeing {len(frame_paths)} random frames from the video. Be specific and culturally aware.

IMPORTANT:
- If this is a well-known meme or clip, use its ACTUAL name (e.g., "Absolute Cinema", "But It Refused", "Walter White Falling")
- Include internet slang/culture terms (e.g., "kino", "based", "wojak", "soyjak", "copium")
- Identify specific characters, franchises, or sources (e.g., "Breaking Bad", "Mario", "Undertale")
- Note the action/movement if visible across frames
- Include visual elements as keywords (colors, objects, text shown)

Provide:
1. NAME: The meme/clip name if recognizable, otherwise a 2-4 word descriptive title
2. DESCRIPTION: One sentence about what's happening or the context
3. CAPTION: Comma-separated keywords including: meme terms, characters, franchises, emotions, actions, visual elements, internet slang

Examples of good labels:
- Name: "But It Refused", Caption: "undertale heart determination text red gaming animation"
- Name: "Walter White Falling", Caption: "breaking bad walter collapse floor dramatic"
- Name: "Goomba Walking", Caption: "mario enemy mushroom brown gaming nintendo animation"

Format as JSON:
{{
  "name": "specific meme name or title",
  "description": "what's happening in the video",
  "caption": "keyword1 keyword2 keyword3 keyword4"
}}"""

        try:
            # Build message content with text + all images
            message_content = [{"type": "text", "text": prompt}] + image_contents

            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": message_content,
                    }
                ],
                max_tokens=300,
                response_format={"type": "json_object"}
            )

            import json
            content = response.choices[0].message.content
            result = json.loads(content)
            return result

        except Exception as e:
            print(f"OpenAI Vision API error: {e}")
            # Fallback to basic caption
            return {
                "name": "Untitled Video",
                "description": f"A video reaction clip",
                "caption": "video reaction meme clip"
            }

    @staticmethod
    async def generate_caption_from_image(image_path: str, file_type: str) -> dict:
        """
        Use OpenAI Vision API to generate name, description, and searchable caption
        for an image or video thumbnail.
        """
        # Scale image if needed and encode to base64
        scaled_image_bytes, mime_type = OpenAIService.scale_image_if_needed(image_path)
        image_data = base64.b64encode(scaled_image_bytes).decode("utf-8")

        prompt = """You are analyzing a reaction image/meme for a collection. Be specific and culturally aware.

IMPORTANT:
- If this is a well-known meme, use its ACTUAL meme name (e.g., "Absolute Cinema", "But It Refused", "Loss")
- Include internet slang/culture terms (e.g., "kino", "based", "wojak", "soyjak", "copium")
- Identify specific characters, franchises, or sources (e.g., "Undertale", "Mario", "Oppenheimer")
- Include visual elements as keywords (colors, objects, text shown)

Provide:
1. NAME: The meme name if recognizable, otherwise a 2-4 word descriptive title
2. DESCRIPTION: One sentence about what's shown or the context
3. CAPTION: Comma-separated keywords including: meme terms, characters, franchises, emotions, visual elements, internet slang

Examples of good labels:
- Name: "But It Refused", Caption: "undertale heart determination text red gaming"
- Name: "Absolute Cinema", Caption: "kino perfection movie reaction pointing"
- Name: "Goomba", Caption: "mario enemy mushroom brown gaming nintendo"

Format as JSON:
{
  "name": "specific meme name or title",
  "description": "what's happening in the image",
  "caption": "keyword1 keyword2 keyword3 keyword4"
}"""

        try:
            response = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": prompt},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": f"data:{mime_type};base64,{image_data}"
                                },
                            },
                        ],
                    }
                ],
                max_tokens=300,
                response_format={"type": "json_object"}
            )

            import json
            content = response.choices[0].message.content
            result = json.loads(content)
            return result

        except Exception as e:
            print(f"OpenAI Vision API error: {e}")
            # Fallback to basic caption
            return {
                "name": "Untitled Reaction",
                "description": f"A {file_type} reaction",
                "caption": f"{file_type} reaction meme"
            }

    @staticmethod
    async def generate_text_embedding(text: str) -> List[float]:
        """
        Generate text embedding using OpenAI's embedding model.
        """
        try:
            response = client.embeddings.create(
                model="text-embedding-3-small",
                input=text,
                encoding_format="float"
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"OpenAI Embeddings API error: {e}")
            # Return zero vector as fallback
            return [0.0] * 1536
