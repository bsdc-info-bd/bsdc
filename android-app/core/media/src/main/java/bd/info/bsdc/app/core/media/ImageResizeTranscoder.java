package bd.info.bsdc.app.core.media;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.os.Build;
import androidx.exifinterface.media.ExifInterface;
import bd.info.bsdc.app.core.model.MediaPurpose;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;

/**
 * Deterministic EXIF orientation correction, aspect-preserving downscaling,
 * and high-efficiency WebP encoding for ImgBB uploads.
 */
public final class ImageResizeTranscoder {

    private static final int QUALITY_PERCENT = 85;
    private static final int SMALL_WEBP_BYTES = 48 * 1024;

    public static final class TranscodedImage {
        public final byte[] bytes;
        public final String mimeType;
        public final String fileName;
        public final int width;
        public final int height;

        public TranscodedImage(byte[] bytes, String mimeType, String fileName, int width, int height) {
            this.bytes = bytes;
            this.mimeType = mimeType;
            this.fileName = fileName;
            this.width = width;
            this.height = height;
        }
    }

    private ImageResizeTranscoder() {}

    public static TranscodedImage transcodeForPurpose(
        byte[] rawBytes,
        String originalFileName,
        MediaPurpose purpose
    ) throws IOException {
        if (rawBytes == null || rawBytes.length == 0) {
            throw new IllegalArgumentException("Empty image payload");
        }
        if (!ImageSignatureInspector.looksLikeImageBytes(rawBytes)) {
            throw new IllegalArgumentException("File bytes are not a supported image");
        }

        String sniffedMime = ImageSignatureInspector.sniffMimeType(rawBytes);
        String baseName = stripExtension(originalFileName);

        // Preserve animated GIFs and tiny WebPs directly without re-compression
        if ("image/gif".equals(sniffedMime)) {
            BitmapFactory.Options opts = decodeBounds(rawBytes);
            return new TranscodedImage(rawBytes, "image/gif", baseName + ".gif", opts.outWidth, opts.outHeight);
        }
        if ("image/webp".equals(sniffedMime) && rawBytes.length <= SMALL_WEBP_BYTES) {
            BitmapFactory.Options opts = decodeBounds(rawBytes);
            return new TranscodedImage(rawBytes, "image/webp", baseName + ".webp", opts.outWidth, opts.outHeight);
        }

        int maxEdge = purpose.getMaxDimensionPx();
        BitmapFactory.Options bounds = decodeBounds(rawBytes);
        int srcW = Math.max(1, bounds.outWidth);
        int srcH = Math.max(1, bounds.outHeight);

        int sampleSize = 1;
        while ((srcW / sampleSize) > maxEdge * 2 || (srcH / sampleSize) > maxEdge * 2) {
            sampleSize *= 2;
        }

        BitmapFactory.Options decodeOpts = new BitmapFactory.Options();
        decodeOpts.inSampleSize = sampleSize;
        decodeOpts.inPreferredConfig = Bitmap.Config.ARGB_8888;
        Bitmap decoded = BitmapFactory.decodeByteArray(rawBytes, 0, rawBytes.length, decodeOpts);
        if (decoded == null) {
            throw new IllegalArgumentException("Unable to decode image bitmap");
        }

        Bitmap oriented = applyExifOrientation(decoded, rawBytes);
        if (oriented != decoded) {
            decoded.recycle();
        }

        int w = oriented.getWidth();
        int h = oriented.getHeight();
        int longest = Math.max(w, h);
        Bitmap bounded;
        if (longest > maxEdge) {
            float scale = (float) maxEdge / (float) longest;
            int outW = Math.max(1, Math.round(w * scale));
            int outH = Math.max(1, Math.round(h * scale));
            bounded = Bitmap.createScaledBitmap(oriented, outW, outH, true);
            if (bounded != oriented) {
                oriented.recycle();
            }
        } else {
            bounded = oriented;
        }

        byte[] encoded = compressWebp(bounded);
        int finalW = bounded.getWidth();
        int finalH = bounded.getHeight();
        bounded.recycle();

        if ("image/webp".equals(sniffedMime) && longest <= maxEdge && rawBytes.length <= encoded.length) {
            return new TranscodedImage(rawBytes, "image/webp", baseName + ".webp", finalW, finalH);
        }
        return new TranscodedImage(encoded, "image/webp", baseName + ".webp", finalW, finalH);
    }

    private static BitmapFactory.Options decodeBounds(byte[] bytes) {
        BitmapFactory.Options opts = new BitmapFactory.Options();
        opts.inJustDecodeBounds = true;
        BitmapFactory.decodeByteArray(bytes, 0, bytes.length, opts);
        return opts;
    }

    private static Bitmap applyExifOrientation(Bitmap source, byte[] rawBytes) {
        int orientation = ExifInterface.ORIENTATION_NORMAL;
        try (ByteArrayInputStream bais = new ByteArrayInputStream(rawBytes)) {
            ExifInterface exif = new ExifInterface(bais);
            orientation = exif.getAttributeInt(
                ExifInterface.TAG_ORIENTATION,
                ExifInterface.ORIENTATION_NORMAL
            );
        } catch (IOException ignored) {
            return source;
        }

        Matrix matrix = new Matrix();
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
                matrix.postRotate(90f);
                break;
            case ExifInterface.ORIENTATION_ROTATE_180:
                matrix.postRotate(180f);
                break;
            case ExifInterface.ORIENTATION_ROTATE_270:
                matrix.postRotate(270f);
                break;
            case ExifInterface.ORIENTATION_FLIP_HORIZONTAL:
                matrix.preScale(-1f, 1f);
                break;
            case ExifInterface.ORIENTATION_FLIP_VERTICAL:
                matrix.preScale(1f, -1f);
                break;
            default:
                return source;
        }
        return Bitmap.createBitmap(source, 0, 0, source.getWidth(), source.getHeight(), matrix, true);
    }

    @SuppressWarnings("deprecation")
    private static byte[] compressWebp(Bitmap bitmap) {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        Bitmap.CompressFormat format = Build.VERSION.SDK_INT >= Build.VERSION_CODES.R
            ? Bitmap.CompressFormat.WEBP_LOSSY
            : Bitmap.CompressFormat.WEBP;
        bitmap.compress(format, QUALITY_PERCENT, out);
        return out.toByteArray();
    }

    private static String stripExtension(String name) {
        if (name == null || name.trim().isEmpty()) return "bsdc_image";
        String trimmed = name.trim();
        int dot = trimmed.lastIndexOf('.');
        String base = dot > 0 ? trimmed.substring(0, dot) : trimmed;
        return base.isEmpty() ? "bsdc_image" : base;
    }
}
