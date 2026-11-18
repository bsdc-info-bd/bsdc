package bd.info.bsdc.app.feature.feed

import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * A comment that carries a picture (migration 0120), checked at the payload.
 *
 * Three things can go wrong here and none of them are visible on a phone until a
 * member tries it: the picture columns are simply not sent (a picture that
 * silently vanishes), a comment with only a picture is refused because the body
 * was not allowed to be empty (the database accepts it, and the client must not
 * invent a placeholder), and half an aspect ratio is sent (the trigger refuses
 * the whole insert).
 */
class CommentPayloadTest {

    private val image = CommentImage(
        url = "https://i.ibb.co/ada111/crack.jpg",
        thumbUrl = "https://i.ibb.co/ada111/crack-medium.jpg",
        alt = "The crack runs down the left side",
        width = 1200,
        height = 900,
    )

    @Test
    fun wordsOnlySendsNoPictureColumns() {
        val payload = CommentPayload.build("post-1", "ada", "  hello  ")
        val json = payload.jsonObject
        assertEquals("hello", json["body"]?.jsonPrimitive?.content)
        assertFalse(json.containsKey("image_url"))
        assertFalse(json.containsKey("image_width"))
    }

    @Test
    fun pictureWithoutWordsIsAcceptedAndSendsEverything() {
        val payload = CommentPayload.build("post-1", "ada", "", image = image)
        val json = payload.jsonObject
        assertEquals("", json["body"]?.jsonPrimitive?.content)
        assertEquals(image.url, json["image_url"]?.jsonPrimitive?.content)
        assertEquals(image.thumbUrl, json["image_thumb_url"]?.jsonPrimitive?.content)
        assertEquals("1200", json["image_width"]?.jsonPrimitive?.content)
        assertEquals("900", json["image_height"]?.jsonPrimitive?.content)
    }

    @Test
    fun aMissingVariantFallsBackToTheOriginal() {
        val payload = CommentPayload.build(
            "post-1",
            "ada",
            "look",
            image = image.copy(thumbUrl = ""),
        )
        assertEquals(image.url, payload.jsonObject["image_thumb_url"]?.jsonPrimitive?.content)
    }

    @Test
    fun anUnknownSizeSendsNeitherDimension() {
        val payload = CommentPayload.build(
            "post-1",
            "ada",
            "look",
            image = image.copy(width = null, height = null),
        )
        val json = payload.jsonObject
        assertFalse(json.containsKey("image_width"))
        assertFalse(json.containsKey("image_height"))
        // The description is still sent; only the numbers are unknown.
        assertEquals(
            "The crack runs down the left side",
            json["image_alt"]?.jsonPrimitive?.content,
        )
    }

    @Test
    fun theRatioIsKnownOnlyWhenBothDimensionsAre() {
        val ratio = image.ratio
        assertTrue(ratio != null && kotlin.math.abs(ratio - 1200f / 900f) < 0.0001f)
        assertNull(image.copy(height = null).ratio)
        assertNull(image.copy(width = 0).ratio)
    }

    @Test
    fun aReplyKeepsItsParent() {
        val payload = CommentPayload.build("post-1", "ada", "reply", parentId = "c-1")
        assertEquals("c-1", payload.jsonObject["parent_id"]?.jsonPrimitive?.content)
        val topLevel = CommentPayload.build("post-1", "ada", "top")
        assertTrue(topLevel.jsonObject["parent_id"].toString() == "null")
    }
}
