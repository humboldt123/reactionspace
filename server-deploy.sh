#!/bin/bash

# Server-side deployment script
# Run this directly on your VPS to pull and deploy changes

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[!]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${BLUE}[i]${NC} $1"
}

# Display help
show_help() {
    cat << EOF
ReactionSpace Server Deployment Script

Usage: ./server-deploy.sh [command]

Commands:
    setup       - First-time setup (clone repo, install docker, etc.)
    deploy      - Pull latest changes and restart services
    restart     - Restart all services without pulling
    rebuild     - Rebuild containers from scratch
    logs        - View application logs
    status      - Show service status
    stop        - Stop all services
    start       - Start all services
    ssl         - Set up SSL certificate
    help        - Show this help message

Examples:
    ./server-deploy.sh setup
    ./server-deploy.sh deploy
    ./server-deploy.sh logs
EOF
}

# First-time setup
setup() {
    print_status "Starting initial setup..."

    # Install Docker
    if ! command -v docker &> /dev/null; then
        print_status "Installing Docker..."
        curl -fsSL https://get.docker.com -o get-docker.sh
        sudo sh get-docker.sh
        sudo usermod -aG docker $USER
        rm get-docker.sh
        print_status "Docker installed!"
    else
        print_info "Docker already installed"
    fi

    # Install Docker Compose
    if ! docker compose version &> /dev/null; then
        print_status "Installing Docker Compose..."
        sudo apt-get update
        sudo apt-get install -y docker-compose-plugin
        print_status "Docker Compose installed!"
    else
        print_info "Docker Compose already installed"
    fi

    # Check if we're in the repo already
    if [ ! -f "docker-compose.yml" ]; then
        print_error "Not in reactionspace directory!"
        print_warning "First, clone your git repository:"
        echo ""
        echo "  cd /home/vish"
        echo "  git clone YOUR_GIT_REPO_URL reactionspace"
        echo "  cd reactionspace"
        echo "  chmod +x server-deploy.sh"
        echo "  ./server-deploy.sh setup"
        echo ""
        exit 1
    fi

    print_status "Setting up project..."

    # Set up environment files
    if [ ! -f "backend/.env" ]; then
        print_warning "Setting up environment files..."
        cp backend/.env.production backend/.env
        print_warning "IMPORTANT: Edit backend/.env with your credentials!"
        print_info "Run: nano backend/.env"
    else
        print_info "Environment file already exists"
    fi

    # Create necessary directories
    mkdir -p backend/uploads
    mkdir -p certbot/conf
    mkdir -p certbot/www

    print_status "Setup complete!"
    print_warning "Don't forget to:"
    echo "  1. Edit backend/.env with your API keys"
    echo "  2. Point your domain DNS to this server's IP"
    echo "  3. Run: ./server-deploy.sh deploy"
}

# Deploy (pull and restart)
deploy() {
    print_status "Deploying latest changes..."

    # Find the reactionspace directory
    if [ -d "/home/vish/reactionspace" ]; then
        cd /home/vish/reactionspace
    elif [ -d "$(pwd)" ] && [ -f "docker-compose.yml" ]; then
        print_info "Using current directory"
    else
        print_error "Cannot find reactionspace directory!"
        print_info "Make sure you're in the project directory or it exists at /home/vish/reactionspace"
        exit 1
    fi

    # Pull latest changes
    print_status "Pulling from git..."
    git pull origin main

    # Stop services
    print_status "Stopping services..."
    docker compose down

    # Build images
    print_status "Building containers..."
    docker compose build

    # Start services
    print_status "Starting services..."
    docker compose up -d

    # Wait and show status
    sleep 5
    print_status "Deployment complete!"
    docker compose ps
}

# Restart services
restart() {
    print_status "Restarting services..."
    docker compose restart
    sleep 3
    docker compose ps
}

# Rebuild from scratch
rebuild() {
    print_status "Rebuilding containers from scratch..."
    docker compose down -v
    docker compose build --no-cache
    docker compose up -d
    sleep 5
    docker compose ps
}

# View logs
logs() {
    docker compose logs -f --tail=100 "$2"
}

# Show status
status() {
    print_info "Service status:"
    docker compose ps
    echo ""
    print_info "Disk usage:"
    df -h | grep -E '^Filesystem|/$'
    echo ""
    print_info "Docker disk usage:"
    docker system df
}

# Stop services
stop() {
    print_status "Stopping all services..."
    docker compose down
}

# Start services
start() {
    print_status "Starting services..."
    docker compose up -d
    sleep 3
    docker compose ps
}

# Set up SSL
setup_ssl() {
    print_status "Setting up SSL certificate..."

    print_warning "Make sure your domain DNS is pointing to this server!"
    read -p "Enter your email for SSL notifications: " email
    read -p "Press Enter to continue or Ctrl+C to cancel..."

    # Obtain certificate
    docker compose run --rm certbot certonly \
        --webroot \
        --webroot-path=/var/www/certbot \
        --email "$email" \
        --agree-tos \
        --no-eff-email \
        -d reactionspace.app \
        -d www.reactionspace.app

    print_status "SSL certificate obtained!"
    print_warning "Now you need to enable HTTPS in nginx config:"
    echo "  1. Edit nginx/sites-enabled/reactionspace.conf"
    echo "  2. Uncomment the HTTPS server block"
    echo "  3. Comment out the HTTP-only block (keep HTTP redirect)"
    echo "  4. Run: ./server-deploy.sh restart"
}

# Main script logic
case "$1" in
    setup)
        setup
        ;;
    deploy)
        deploy
        ;;
    restart)
        restart
        ;;
    rebuild)
        rebuild
        ;;
    logs)
        logs
        ;;
    status)
        status
        ;;
    stop)
        stop
        ;;
    start)
        start
        ;;
    ssl)
        setup_ssl
        ;;
    help|--help|-h|"")
        show_help
        ;;
    *)
        print_error "Unknown command: $1"
        echo ""
        show_help
        exit 1
        ;;
esac
