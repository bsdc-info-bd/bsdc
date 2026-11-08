package bd.info.bsdc.app.links

import org.junit.Assert.assertEquals
import org.junit.Test

class IncomingLinkParserTest {
    @Test fun acceptsApprovedHttpsOriginsOnly() {
        assertEquals(IncomingLink.Internal("/p/123"), IncomingLinkParser.parse("https://www.bsdc.info.bd/post/123"))
        assertEquals(IncomingLink.Internal("/verify?id=abc"), IncomingLinkParser.parse("https://vf.main.bsdc.info.bd/verify?id=abc"))
        assertEquals(IncomingLink.Ignore, IncomingLinkParser.parse("https://www.bsdc.info.bd.attacker.test/p/123"))
        assertEquals(IncomingLink.Ignore, IncomingLinkParser.parse("http://www.bsdc.info.bd/p/123"))
        assertEquals(IncomingLink.Ignore, IncomingLinkParser.parse("https://user@www.bsdc.info.bd/p/123"))
    }

    @Test fun newsIsExplicitlySeparateAndHttpsOnly() {
        assertEquals(IncomingLink.News("https://news.bsdc.info.bd/story/42"), IncomingLinkParser.parse("https://news.bsdc.info.bd/story/42"))
        assertEquals(IncomingLink.Ignore, IncomingLinkParser.parse("https://news.bsdc.info.bd.attacker.test/story/42"))
    }

    @Test fun acceptsOnlySecureCustomSchemeAndNormalizesPostRoute() {
        assertEquals(IncomingLink.Internal("/p/abc"), IncomingLinkParser.parse("bsdc://post/abc"))
        assertEquals(IncomingLink.Ignore, IncomingLinkParser.parse("javascript:alert(1)"))
        assertEquals(IncomingLink.Ignore, IncomingLinkParser.parse(null))
    }
}
