package bd.info.bsdc.app.feed

import bd.info.bsdc.app.model.CommunityPost
import java.time.Duration
import java.time.Instant
import kotlin.math.exp

/**
 * A transparent client-side re-ranker for the already-authorized candidate page from Firestore.
 * It does not pretend to be a server-side neural model. Expensive embedding/ANN retrieval belongs
 * in a protected backend; this deterministic layer gives users a fast, explainable ranking while
 * keeping the free mobile client within its privacy and compute budget.
 */
class FeedRankingEngine(
    private val weights: Weights = Weights()
) {
    data class Weights(
        val dwell: Double = 2.1,
        val comment: Double = 1.5,
        val share: Double = 2.5,
        val affinity: Double = 1.8,
        val topic: Double = 1.2,
        val quality: Double = 1.0,
        val recency: Double = 1.3,
        val negative: Double = 2.3,
        val report: Double = 4.0
    )

    data class ScoredPost(val post: CommunityPost, val score: Double, val exploration: Boolean)

    fun score(post: CommunityPost, now: Instant = Instant.now()): Double {
        val ranking = post.ranking
        val ageHours = post.createdAt?.toDate()?.toInstant()?.let {
            Duration.between(it, now).toMinutes().coerceAtLeast(0) / 60.0
        } ?: 0.0
        val freshness = exp(-ageHours / 36.0)
        return (ranking.dwellProbability * weights.dwell) +
            (ranking.commentProbability * weights.comment) +
            (ranking.shareProbability * weights.share) +
            (ranking.authorAffinity * weights.affinity) +
            (ranking.topicAffinity * weights.topic) +
            (ranking.quality * weights.quality) +
            (freshness * weights.recency) -
            (ranking.negativeFeedback * weights.negative) -
            (ranking.reportRate * weights.report)
    }

    /** Stable exploration (roughly 7%) and author/topic diversity without random feed flicker. */
    fun rank(candidates: List<CommunityPost>, viewerId: String, now: Instant = Instant.now()): List<ScoredPost> {
        val scored = candidates.map { post ->
            val explore = deterministicBucket("$viewerId:${post.id}") < 7
            val score = score(post, now) + if (explore) 0.22 else 0.0
            ScoredPost(post, score, explore)
        }.sortedByDescending { it.score }

        val authorRun = mutableMapOf<String, Int>()
        val deferred = mutableListOf<ScoredPost>()
        val result = mutableListOf<ScoredPost>()
        for (item in scored) {
            val consecutive = authorRun[item.post.authorId] ?: 0
            if (consecutive >= 2) deferred += item else {
                result += item
                authorRun.keys.toList().forEach { authorRun[it] = 0 }
                authorRun[item.post.authorId] = consecutive + 1
            }
        }
        return result + deferred
    }

    private fun deterministicBucket(input: String): Int = (input.hashCode().toLong() and 0x7fffffffL).rem(100).toInt()
}
