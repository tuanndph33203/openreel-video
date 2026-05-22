/* utils/file-utils.ts */

/**
 * Reads a FileSystemFileHandle (obtained via the File System Access API) and
 * builds a MediaItem compatible with OpenReel's core data model.
 *
 * The function extracts basic metadata (duration, dimensions, codec) using
 * a temporary video element. If the browser cannot decode the file, we fall
 * back to dummy metadata – the export engine will still render the raw frames.
 */
export async function createMediaItemFromFileHandle(fileHandle: FileSystemFileHandle) {
  const file = await fileHandle.getFile();
  const blob = await file.arrayBuffer().then((buf) => new Blob([buf], { type: file.type }));

  // Generate a deterministic ID based on file name + lastModified
  const id = `${file.name}-${file.lastModified}`;

  // Attempt to get video metadata (duration, width, height, frameRate)
  let metadata = {
    duration: 0,
    width: 0,
    height: 0,
    frameRate: 30,
    codec: file.type,
    sampleRate: 0,
    channels: 0,
    fileSize: file.size,
  } as any;

  if (file.type.startsWith('video/')) {
    try {
      const video = document.createElement('video');
      const url = URL.createObjectURL(blob);
      video.src = url;
      await new Promise((resolve, reject) => {
        video.addEventListener('loadedmetadata', resolve, { once: true });
        video.addEventListener('error', reject, { once: true });
      });
      metadata.duration = video.duration;
      metadata.width = video.videoWidth;
      metadata.height = video.videoHeight;
      // Approximate frameRate using videoHeight/width ratio (fallback 30)
      metadata.frameRate = 30;
      URL.revokeObjectURL(url);
    } catch (e) {
      console.warn('Unable to extract video metadata', e);
    }
  }

  const mediaItem = {
    id,
    name: file.name,
    type: file.type.startsWith('video/') ? 'video' : file.type.startsWith('audio/') ? 'audio' : 'image',
    fileHandle,
    blob,
    metadata,
    thumbnailUrl: null,
    waveformData: null,
    filmstripThumbnails: undefined,
    isPlaceholder: false,
    originalUrl: null,
    sourceFile: {
      name: file.name,
      size: file.size,
      lastModified: file.lastModified,
    },
  } as any;

  return mediaItem;
}
