package bd.info.bsdc.app.core.database

import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.FeedPost
import bd.info.bsdc.app.core.model.PollOptionModel
import bd.info.bsdc.app.core.model.PostAuthorSummary
import bd.info.bsdc.app.core.model.PostKind
import bd.info.bsdc.app.core.model.PostMediaModel
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Test

class BsdcDatabaseMapperTest {

    @Test
    fun roundTripsFeedPostEntityWithTagsMediaAndPollIntact() {
        val original = FeedPost(
            id = "post-001",
            slug = "kotlin-2-guide",
            kind = PostKind.POLL,
            title = "বাংলায় কোড পোস্ট",
            body = "Full markdown body with `println()`",
            excerpt = "Full markdown body",
            coverUrl = "https://i.ibb.co/cover/a.webp",
            code = "fun main() = println(\"BSDC\")",
            codeLanguage = "kotlin",
            language = AppLanguage.BN,
            readingTime = 4,
            views = 320,
            likes = 45,
            comments = 12,
            author = PostAuthorSummary(
                uid = "u-1",
                username = "tasnim",
                displayName = "Tasnim Rahman",
                avatarUrl = "https://i.ibb.co/avatar/a.webp",
            ),
            tags = listOf("kotlin", "android", "bangladesh"),
            media = listOf(
                PostMediaModel(
                    mediaId = "m-1",
                    url = "https://i.ibb.co/img/full.webp",
                    thumbUrl = "https://i.ibb.co/img/med.webp",
                    altText = "Architecture diagram",
                    position = 0,
                    width = 1280,
                    height = 720,
                ),
            ),
            poll = listOf(
                PollOptionModel(id = "opt-1", label = "Compose", votes = 88, position = 0),
                PollOptionModel(id = "opt-2", label = "Views", votes = 4, position = 1),
            ),
        )

        val entity = BsdcDatabaseMappers.toEntity(original, algorithm = "ranked", feedOrder = 0, cachedAtEpochMs = 1700000000L)
        assertEquals("ranked", entity.algorithm)
        assertEquals(0, entity.feedOrder)

        val restored = BsdcDatabaseMappers.toDomain(entity)
        assertEquals(original.id, restored.id)
        assertEquals(PostKind.POLL, restored.kind)
        assertEquals(AppLanguage.BN, restored.language)
        assertNotNull(restored.author)
        assertEquals("tasnim", restored.author!!.username)
        assertEquals(listOf("kotlin", "android", "bangladesh"), restored.tags)
        assertEquals(1, restored.media.size)
        assertEquals("https://i.ibb.co/img/med.webp", restored.media[0].thumbUrl)
        assertEquals(2, restored.poll.size)
        assertEquals(88, restored.poll[0].votes)
    }
}
