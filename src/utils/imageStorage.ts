import { open } from '@tauri-apps/plugin-dialog';
import { readFile, writeFile, mkdir, exists } from '@tauri-apps/plugin-fs';
import { appDataDir, join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';

// Directory name for storing images
const IMAGES_DIR = 'images';

/**
 * Get the path to the images directory in app data
 */
async function getImagesDir(): Promise<string> {
    const appData = await appDataDir();
    return await join(appData, IMAGES_DIR);
}

/**
 * Ensure the images directory exists
 */
async function ensureImagesDir(): Promise<void> {
    const imagesDir = await getImagesDir();
    if (!(await exists(imagesDir))) {
        await mkdir(imagesDir, { recursive: true });
    }
}

/**
 * Generate a unique filename based on timestamp and random string
 */
function generateFilename(originalName: string): string {
    const ext = originalName.split('.').pop() || 'png';
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `img_${timestamp}_${random}.${ext}`;
}

/**
 * Open file picker, copy selected image to app data directory, and return the asset URL
 * @returns Asset URL that can be used in img src, or null if cancelled
 */
export async function pickAndSaveImage(): Promise<string | null> {
    try {
        // Open file picker
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Images',
                extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
            }]
        });

        if (!selected) {
            return null; // User cancelled
        }

        const sourcePath = selected as string;

        // Ensure images directory exists
        await ensureImagesDir();

        // Generate unique filename
        const originalName = sourcePath.split('/').pop() || 'image.png';
        const newFilename = generateFilename(originalName);

        // Read source file
        const imageData = await readFile(sourcePath);

        // Write to images directory
        const imagesDir = await getImagesDir();
        const destPath = await join(imagesDir, newFilename);
        await writeFile(destPath, imageData);

        // Convert to asset URL for use in webview
        const assetUrl = convertFileSrc(destPath);

        return assetUrl;
    } catch (error) {
        console.error('Failed to pick and save image:', error);
        throw error;
    }
}

/**
 * Pick an image from system dialog and save a copy locally
 * @returns Asset URL for preview, or null if cancelled
 */
export async function pickImage(): Promise<string | null> {
    try {
        const selected = await open({
            multiple: false,
            filters: [{
                name: 'Images',
                extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp']
            }]
        });

        if (!selected) {
            return null;
        }

        const sourcePath = selected as string;

        // Ensure images directory exists
        await ensureImagesDir();

        // Generate unique filename
        const originalName = sourcePath.split(/[\\/]/).pop() || 'image.png';
        const newFilename = generateFilename(originalName);

        // Read source file
        const imageData = await readFile(sourcePath);

        // Write to images directory (keep local copy as requested)
        const imagesDir = await getImagesDir();
        const destPath = await join(imagesDir, newFilename);
        await writeFile(destPath, imageData);

        // Return Base64 Data URI for reliable preview in Cropper
        const base64 = typeof Buffer !== 'undefined'
            ? Buffer.from(imageData).toString('base64')
            : arrayBufferToBase64(imageData);

        return `data:image/${originalName.split('.').pop()};base64,${base64}`;
    } catch (error) {
        console.error('Failed to pick image:', error);
        throw error;
    }
}

function arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    const len = bytes.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return window.btoa(binary);
}

/**
 * Save an image from a buffer (e.g. from canvas)
 */
export async function saveImageFromBuffer(buffer: Uint8Array, originalName: string = 'cropped.png'): Promise<string> {
    try {
        await ensureImagesDir();
        const newFilename = generateFilename(originalName);
        const imagesDir = await getImagesDir();
        const destPath = await join(imagesDir, newFilename);

        await writeFile(destPath, buffer);

        return convertFileSrc(destPath);
    } catch (error) {
        console.error('Failed to save image from buffer:', error);
        throw error;
    }
}

/**
 * Save an image from a File object (e.g., from drag-and-drop)
 * @param file The File object to save
 * @returns Asset URL that can be used in img src
 */
export async function saveImageFromFile(file: File): Promise<string> {
    try {
        const arrayBuffer = await file.arrayBuffer();
        const uint8Array = new Uint8Array(arrayBuffer);
        return await saveImageFromBuffer(uint8Array, file.name);
    } catch (error) {
        console.error('Failed to save image from file:', error);
        throw error;
    }
}

/**
 * Check if a URL is a local asset URL (from our stored images)
 */
export function isLocalAssetUrl(url: string): boolean {
    return url.startsWith('asset://') || url.startsWith('https://asset.localhost/');
}

/**
 * Get human-readable info about an image URL
 */
export function getImageUrlType(url: string): 'local' | 'remote' | 'data' | 'none' {
    if (!url) return 'none';
    if (url.startsWith('data:')) return 'data';
    if (isLocalAssetUrl(url)) return 'local';
    return 'remote';
}
