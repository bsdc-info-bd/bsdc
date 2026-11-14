package bd.info.bsdc.app.core.auth;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import bd.info.bsdc.app.core.model.BsdcRole;
import bd.info.bsdc.app.core.model.SessionClaims;
import java.util.Map;
import org.junit.Test;

public class AuthDomainValidatorsTest {

    @Test
    public void validatesUsernamesMatchingWebConstraints() {
        assertEquals(
            AuthDomainValidators.UsernameValidation.VALID,
            AuthDomainValidators.validateUsername("  Tasnim_BD9  ")
        );
        assertEquals(
            AuthDomainValidators.UsernameValidation.TOO_SHORT,
            AuthDomainValidators.validateUsername("ab")
        );
        assertEquals(
            AuthDomainValidators.UsernameValidation.LEADING_OR_TRAILING_UNDERSCORE,
            AuthDomainValidators.validateUsername("_tasnim")
        );
        assertEquals(
            AuthDomainValidators.UsernameValidation.LEADING_OR_TRAILING_UNDERSCORE,
            AuthDomainValidators.validateUsername("tasnim_")
        );
        assertEquals(
            AuthDomainValidators.UsernameValidation.INVALID_CHARACTERS,
            AuthDomainValidators.validateUsername("tasnim-bd")
        );
        assertEquals(
            AuthDomainValidators.UsernameValidation.RESERVED,
            AuthDomainValidators.validateUsername("admin")
        );
        assertEquals(
            AuthDomainValidators.UsernameValidation.RESERVED,
            AuthDomainValidators.validateUsername("BSDC")
        );
    }

    @Test
    public void scoresPasswordStrengthAccurately() {
        assertEquals(0, AuthDomainValidators.scorePassword(""));
        assertEquals(1, AuthDomainValidators.scorePassword("abcdefgh"));
        assertEquals(2, AuthDomainValidators.scorePassword("Abcdefgh"));
        assertEquals(3, AuthDomainValidators.scorePassword("Abcdefghijkl"));
        assertEquals(4, AuthDomainValidators.scorePassword("Abcdefgh12!@"));
        // Repeated character cap reduces score by 1
        assertEquals(3, AuthDomainValidators.scorePassword("AAAAbcdefgh1!"));
    }

    @Test
    public void parsesClaimsDistinguishingPostgresRoleFromBsdcRole() {
        SessionClaims member = AuthDomainValidators.parseSessionClaims(
            Map.of("role", "authenticated", "bsdc_role", "member", "vendor", false, "staff", false)
        );
        assertTrue(member.getPostgresAuthenticated());
        assertEquals(BsdcRole.MEMBER, member.getRole());
        assertFalse(member.getStaff());

        SessionClaims mod = AuthDomainValidators.parseSessionClaims(
            Map.of("role", "authenticated", "bsdc_role", "moderator", "vendor", false, "staff", true)
        );
        assertEquals(BsdcRole.MODERATOR, mod.getRole());
        assertTrue(mod.getStaff());

        // Legacy fallback before bsdc_role migration must still not leak "authenticated"
        SessionClaims legacy = AuthDomainValidators.parseSessionClaims(
            Map.of("role", "authenticated")
        );
        assertEquals(BsdcRole.MEMBER, legacy.getRole());
    }
}
