package bd.info.bsdc.app.core.network

import bd.info.bsdc.app.core.model.AppLanguage
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProfileRowCoercionTest {

    @Test
    fun coercesRowWithNullUsernameAndOversizedSkillsWithoutDroppingProfile() {
        val dto = ProfileRowDto(
            uid = "user-123",
            username = null,
            displayName = "Tasnim Rahman",
            bio = "Android & Kotlin engineer",
            avatarUrl = "https://i.ibb.co/example/avatar.jpg",
            skills = JsonArray(
                listOf(
                    JsonPrimitive("Kotlin"),
                    JsonPrimitive("kotlin"),
                    JsonPrimitive("A_VERY_LONG_SKILL_EXCEEDING_THIRTY_TWO_CHARS"),
                    JsonPrimitive("  "),
                ),
            ),
            language = "en",
            onboardingComplete = false,
            notifications = buildJsonObject { put("messages", false) },
        )

        val profile = ProfileRowCoercer.coerce(dto)
        assertNotNull(profile)
        assertEquals("user-123", profile!!.uid)
        assertEquals("", profile.username)
        assertEquals(AppLanguage.EN, profile.language)
        assertEquals("https://i.ibb.co/example/avatar.jpg", profile.avatarUrl)
        assertEquals(2, profile.skills.size)
        assertEquals("Kotlin", profile.skills[0])
        assertEquals(32, profile.skills[1].length)
        assertTrue(!profile.notifications.messages)
        assertTrue(profile.notifications.followers)
        assertTrue(profile.privacy.showFollowers)
    }

    @Test
    fun coercesPrivacyShowFollowersDefaultsAndExplicitFalse() {
        val explicitFalse = ProfileRowDto(
            uid = "user-456",
            privacy = buildJsonObject {
                put("discoverable", false)
                put("showActivity", "false")
                put("showEmail", true)
                put("showFollowers", false)
            },
        )
        val p1 = ProfileRowCoercer.coerce(explicitFalse)
        assertNotNull(p1)
        assertTrue(!p1!!.privacy.discoverable)
        assertTrue(!p1.privacy.showActivity)
        assertTrue(p1.privacy.showEmail)
        assertTrue(!p1.privacy.showFollowers)

        val missingShowFollowers = ProfileRowDto(
            uid = "user-789",
            privacy = buildJsonObject {
                put("discoverable", true)
                put("showFollowers", "not-a-boolean")
            },
        )
        val p2 = ProfileRowCoercer.coerce(missingShowFollowers)
        assertNotNull(p2)
        assertTrue(p2!!.privacy.discoverable)
        assertTrue(p2.privacy.showFollowers)
    }

    @Test
    fun returnsNullOnlyWhenUidIsMissing() {
        assertNull(ProfileRowCoercer.coerce(ProfileRowDto(uid = "  ")))
    }
}
