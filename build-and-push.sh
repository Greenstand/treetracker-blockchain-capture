#!/bin/bash

# Build and Push Treetracker Capture Service to DigitalOcean Registry

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Configuration
REGISTRY_NAME="treetracker-registry"
IMAGE_NAME="treetracker-capture-service"
IMAGE_TAG="${1:-latest}"
FULL_IMAGE_NAME="registry.digitalocean.com/${REGISTRY_NAME}/${IMAGE_NAME}:${IMAGE_TAG}"

print_info "🐳 Building and pushing ${IMAGE_NAME}:${IMAGE_TAG}"

# Check if Docker is available
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed or not available"
    exit 1
fi

# Check if doctl is available
if ! command -v doctl &> /dev/null; then
    print_warning "doctl CLI not found. Please install it or login to Docker manually:"
    echo "docker login registry.digitalocean.com"
    read -p "Press enter to continue after logging in..."
else
    # Authenticate with DigitalOcean Container Registry
    print_info "Authenticating with DigitalOcean Container Registry..."
    doctl registry login
    print_status "Successfully logged in to DigitalOcean registry"
fi

# Build the Docker image
print_info "Building Docker image: ${FULL_IMAGE_NAME}"
docker build -t ${FULL_IMAGE_NAME} --target production .

if [ $? -eq 0 ]; then
    print_status "Docker image built successfully"
else
    print_error "Failed to build Docker image"
    exit 1
fi

# Push the image to registry
print_info "Pushing image to DigitalOcean Container Registry..."
docker push ${FULL_IMAGE_NAME}

if [ $? -eq 0 ]; then
    print_status "Image pushed successfully: ${FULL_IMAGE_NAME}"
else
    print_error "Failed to push image to registry"
    exit 1
fi

# Tag as latest if not already latest
if [ "${IMAGE_TAG}" != "latest" ]; then
    LATEST_IMAGE="registry.digitalocean.com/${REGISTRY_NAME}/${IMAGE_NAME}:latest"
    print_info "Tagging as latest: ${LATEST_IMAGE}"
    docker tag ${FULL_IMAGE_NAME} ${LATEST_IMAGE}
    docker push ${LATEST_IMAGE}
    print_status "Latest tag pushed successfully"
fi

# Display image info
print_info "📋 Image Details:"
echo "   Registry: registry.digitalocean.com"
echo "   Repository: ${REGISTRY_NAME}/${IMAGE_NAME}"
echo "   Tag: ${IMAGE_TAG}"
echo "   Full Name: ${FULL_IMAGE_NAME}"

# Show image size
IMAGE_SIZE=$(docker images ${FULL_IMAGE_NAME} --format "table {{.Size}}" | tail -n 1)
echo "   Size: ${IMAGE_SIZE}"

print_status "🎉 Build and push completed successfully!"
print_info "You can now deploy this image to Kubernetes using:"
echo "   kubectl apply -f k8s/"