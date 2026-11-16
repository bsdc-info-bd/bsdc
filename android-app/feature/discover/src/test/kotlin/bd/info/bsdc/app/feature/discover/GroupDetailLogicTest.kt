package bd.info.bsdc.app.feature.discover

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class GroupDetailLogicTest {
    @Test
    fun webUrlUsesGroupRouteAndEncodesSlug() {
        assertEquals("https://www.bsdc.info.bd/g/dhaka%20devs", GroupDetailLogic.webUrl(" dhaka devs "))
    }

    @Test
    fun memberAlwaysOpensTheGroup() {
        assertEquals(GroupJoinAction.OPEN, GroupDetailLogic.joinAction("secret", "member", null, true))
    }

    @Test
    fun signedOutViewerCannotJoin() {
        assertEquals(GroupJoinAction.CLOSED, GroupDetailLogic.joinAction("public", null, null, false))
    }

    @Test
    fun publicGroupJoinsDirectlyAndPrivateGroupTakesARequest() {
        assertEquals(GroupJoinAction.JOIN, GroupDetailLogic.joinAction("public", null, null, true))
        assertEquals(GroupJoinAction.REQUEST, GroupDetailLogic.joinAction("private", null, null, true))
    }

    @Test
    fun pendingRequestWinsOverPrivacy() {
        assertEquals(GroupJoinAction.PENDING, GroupDetailLogic.joinAction("private", null, "pending", true))
    }

    @Test
    fun secretGroupIsInviteOnly() {
        assertEquals(GroupJoinAction.CLOSED, GroupDetailLogic.joinAction("secret", null, null, true))
    }

    @Test
    fun moderationRightsFollowRoleRank() {
        assertTrue(GroupDetailLogic.canModerate("owner"))
        assertTrue(GroupDetailLogic.canModerate("moderator"))
        assertFalse(GroupDetailLogic.canModerate("member"))
        assertFalse(GroupDetailLogic.canModerate(null))
        assertTrue(GroupDetailLogic.canAdminister("admin"))
        assertFalse(GroupDetailLogic.canAdminister("moderator"))
    }

    @Test
    fun membersSortByRankThenJoinOrder() {
        data class M(val name: String, val role: String, val joined: String)
        val sorted = GroupDetailLogic.sortMembers(
            listOf(
                M("late member", "member", "2026-11-10T10:00:00Z"),
                M("early member", "member", "2026-11-01T10:00:00Z"),
                M("admin", "admin", "2026-11-09T10:00:00Z"),
                M("owner", "owner", "2026-11-12T10:00:00Z"),
            ),
            roleOf = { it.role },
            joinedAtOf = { it.joined },
        )
        assertEquals(listOf("owner", "admin", "early member", "late member"), sorted.map { it.name })
    }
}
