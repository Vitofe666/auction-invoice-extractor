#!/bin/bash
echo "Installing dependencies..."
npm install

echo "Building application..."
npm run build

echo "Build completed!"
ls -la dist/