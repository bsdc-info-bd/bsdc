package bd.info.bsdc.app.core.media

import bd.info.bsdc.app.core.model.MediaPurpose
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The picture contract, held against the two places that write it.
 *
 * A purpose is not decoration. The edge reads it to decide how hard to compress,
 * `record_media_asset` stores it in a column with a check constraint over it, and the
 * gallery a member searches is grouped by it — on both clients. So each of these three
 * reads the real source of the other side rather than a fixture copied from it: a
 * rename on one end breaks a test on the other, which is the difference between two
 * apps and one app with two faces.
 */
class BsdcMediaPurposeParityTest {

    @Test
    fun theAppFilesPicturesUnderTheWebsOwnPurposes() {
        val source = readRepoFile("main-site", "src", "lib", "storage", "media-contract.ts")
        val block = regexGroup(
            Regex("MEDIA_PURPOSES\\s*:\\s*[^=]+=\\s*\\[(.*?)]", RegexOption.DOT_MATCHES_ALL),
            source,
            "MEDIA_PURPOSES",
        )
        val web = Regex("'([^']+)'").findAll(block).map { it.groupValues[1] }.toList()

        assertEquals(
            "the app and the web must file pictures under the same headings",
            web,
            MediaPurpose.entries.map { it.wireValue },
        )
    }

    @Test
    fun everyPurposeIsAllowedByTheConstraintThatStoresIt() {
        val sql = readRepoFile(
            "supabase",
            "migrations",
            "0132_every_picture_a_member_uploads_is_one_they_can_find_again.sql",
        )
        val block = regexGroup(
            Regex("media_assets_purpose_check check \\((.*?)\\)", RegexOption.DOT_MATCHES_ALL),
            sql,
            "media_assets_purpose_check",
        )
        MediaPurpose.entries.forEach { purpose ->
            assertTrue(
                "the column constraint must accept " + purpose.wireValue,
                block.contains("'" + purpose.wireValue + "'"),
            )
        }
    }

    @Test
    fun theAppSqueezesToTheSizeTheWebPromises() {
        val source = readRepoFile("main-site", "src", "lib", "storage", "upload.ts")
        val block = regexGroup(
            Regex("UPLOAD_MAX_EDGE[^=]*=\\s*\\{(.*?)}", RegexOption.DOT_MATCHES_ALL),
            source,
            "UPLOAD_MAX_EDGE",
        )
        // Comments are stripped first, because the map explains itself next to two of
        // its entries — and a number inside that prose is not a limit anybody chose.
        val web = Regex("'?([a-z-]+)'?\\s*:\\s*(\\d+)")
            .findAll(block.replace(Regex("(?m)//.*$"), ""))
            .associate { it.groupValues[1] to it.groupValues[2].toInt() }

        assertEquals(
            "every purpose the web sizes must be a purpose the app knows",
            web.keys.sorted(),
            MediaPurpose.entries.map { it.wireValue }.sorted(),
        )
        MediaPurpose.entries.forEach { purpose ->
            assertEquals(
                purpose.wireValue + " must be trimmed to the same longest edge",
                web.getValue(purpose.wireValue),
                purpose.maxDimensionPx,
            )
        }
    }

    @Test
    fun bothClientsSayThePurposeWhenTheyRecordAnUpload() {
        // The tenth argument of 0132 is the only place the filing survives the upload,
        // so it is checked on both paths a row can be written by — the function, and
        // the direct insert that stands in when the function is not yet published.
        val android = readRepoFile(
            "android-app",
            "core",
            "media",
            "src",
            "main",
            "kotlin",
            "bd",
            "info",
            "bsdc",
            "app",
            "core",
            "media",
            "BsdcMediaRepository.kt",
        )
        assertTrue(
            "the app must send p_purpose to record_media_asset",
            android.contains("put(\"p_purpose\", purpose.wireValue)"),
        )
        assertTrue(
            "the app's fallback insert must carry the column too",
            android.contains("put(\"purpose\", purpose.wireValue)"),
        )
        // And say it for the upload it just did, not for whatever the caller forgot.
        assertTrue(
            "the app must thread the upload's own purpose into the record call",
            android.contains("recordMediaAsset(user.uid, edgeUpload, purpose)"),
        )

        val web = readRepoFile("main-site", "src", "lib", "data", "media-repository.ts")
        assertTrue(
            "the web must send p_purpose to record_media_asset",
            web.contains("p_purpose: purpose as DbMediaPurpose"),
        )
    }

    private fun regexGroup(regex: Regex, source: String, name: String): String =
        regex.find(source)?.groupValues?.get(1)
            ?: error(name + " was not found in the file it is supposed to live in")

    private fun readRepoFile(vararg parts: String): String {
        // Tests run with the module directory as the working directory, so walk up to
        // the repo root rather than assuming how Gradle was launched.
        var dir: File? = File(System.getProperty("user.dir")).absoluteFile
        repeat(8) {
            val candidate = dir?.let { root -> parts.fold(root) { acc, part -> acc.resolve(part) } }
            if (candidate != null && candidate.isFile) return candidate.readText()
            dir = dir?.parentFile
        }
        error("could not find " + parts.joinToString("/") + " above " + System.getProperty("user.dir"))
    }
}
