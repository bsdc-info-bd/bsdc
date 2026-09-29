package bd.info.bsdc.app.feed

import bd.info.bsdc.app.model.CommunityPost
import bd.info.bsdc.app.model.PostRanking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class FeedRankingEngineTest {
    private val engine = FeedRankingEngine()

    @Test
    fun `positive social predictions outrank negative feedback`() {
        val useful = CommunityPost(id = "useful", authorId = "a", ranking = PostRanking(dwellProbability = .9, shareProbability = .7, quality = .8))
        val hidden = CommunityPost(id = "hidden", authorId = "b", ranking = PostRanking(dwellProbability = .9, negativeFeedback = .9, reportRate = .6))
        assertTrue(engine.score(useful) > engine.score(hidden))
    }

    @Test
    fun `diversifier does not show three consecutive posts from one author`() {
        val candidates = listOf("1", "2", "3").map { CommunityPost(id = it, authorId = "same", ranking = PostRanking(quality = 1.0)) } +
            CommunityPost(id = "other", authorId = "other", ranking = PostRanking(quality = .5))
        val authorIds = engine.rank(candidates, "member").map { it.post.authorId }
        assertEquals(listOf("same", "same", "other", "same"), authorIds)
    }
}
