package bd.info.bsdc.app.core.media;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ImageSignatureAndHostTest {

    @Test
    public void detectsRealImageSignaturesAndRejectsHtmlOrZip() {
        byte[] png = new byte[] { (byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A };
        byte[] jpeg = new byte[] { (byte) 0xFF, (byte) 0xD8, (byte) 0xFF, (byte) 0xE0, 0x00 };
        byte[] webp = new byte[] { 'R', 'I', 'F', 'F', 0, 0, 0, 0, 'W', 'E', 'B', 'P' };
        byte[] htmlSpoof = "<html><body>Rate limited</body></html>".getBytes();
        byte[] zipSpoof = new byte[] { 0x50, 0x4B, 0x03, 0x04, 0x14 };

        assertTrue(ImageSignatureInspector.looksLikeImageBytes(png));
        assertEquals("image/png", ImageSignatureInspector.sniffMimeType(png));
        assertTrue(ImageSignatureInspector.looksLikeImageBytes(jpeg));
        assertEquals("image/jpeg", ImageSignatureInspector.sniffMimeType(jpeg));
        assertTrue(ImageSignatureInspector.looksLikeImageBytes(webp));
        assertEquals("image/webp", ImageSignatureInspector.sniffMimeType(webp));

        assertFalse(ImageSignatureInspector.looksLikeImageBytes(htmlSpoof));
        assertNull(ImageSignatureInspector.sniffMimeType(htmlSpoof));
        assertFalse(ImageSignatureInspector.looksLikeImageBytes(zipSpoof));
    }

    @Test
    public void enforcesImgbbAllowlistAndBlocksCloudinaryAndAudio() {
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://i.ibb.co/abc123/cover.webp"));
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://i2.ibb.co.com/xyz/avatar.jpg"));
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://lh3.googleusercontent.com/a/photo"));
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://avatars.githubusercontent.com/u/1234"));
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://www.gravatar.com/avatar/abc"));
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://api.dicebear.com/9.x/thumbs/svg"));
        assertTrue(ImgbbUrlAllowlist.isAllowedImageUrl("https://firebasestorage.googleapis.com/v0/b/app/o/avatar.png"));

        assertFalse(ImgbbUrlAllowlist.isAllowedImageUrl("https://res.cloudinary.com/demo/image/upload/sample.jpg"));
        assertFalse(ImgbbUrlAllowlist.isAllowedImageUrl("http://i.ibb.co/plain-http.jpg"));
        assertFalse(ImgbbUrlAllowlist.isAllowedImageUrl("https://i.ibb.co/fake/voice.opus"));
        assertFalse(ImgbbUrlAllowlist.isAllowedImageUrl("https://evil.example.com/pixel.png"));

        assertEquals(
            "https://i.ibb.co/plain-http.jpg",
            ImgbbUrlAllowlist.normalizeImageUrl("  http://i.ibb.co/plain-http.jpg  ")
        );
        assertEquals("", ImgbbUrlAllowlist.normalizeImageUrl("https://evil.example.com/pixel.png"));
        assertTrue(ImgbbUrlAllowlist.isRepairableImageUrl("https://i.ibb.co/abc123/avatar.webp"));
        assertFalse(ImgbbUrlAllowlist.isRepairableImageUrl("https://lh3.googleusercontent.com/a/photo"));
    }

    @Test
    public void selectsResponsiveMediumVariantForFeedCardsAndFullForLightbox() {
        String full = "https://i.ibb.co/full/photo.webp";
        String med = "https://i.ibb.co/medium/photo.webp";

        assertEquals(med, ImgbbUrlAllowlist.selectResponsiveUrl(full, med, 480));
        assertEquals(med, ImgbbUrlAllowlist.selectResponsiveUrl(full, med, 640));
        assertEquals(full, ImgbbUrlAllowlist.selectResponsiveUrl(full, med, 1080));
    }
}
