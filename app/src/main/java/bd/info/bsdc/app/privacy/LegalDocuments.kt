package bd.info.bsdc.app.privacy

/**
 * Versioned, bundled documents shown before a member can enter the authenticated community.
 * The same document identifier/version pair is recorded immutably in Firestore after acceptance.
 * Product owners must publish a new document/version and obtain counsel review before changing
 * substantive terms; editing this text without a version change defeats the acceptance record.
 */
enum class LegalDocument(
    val id: String,
    val version: String
) {
    TERMS_OF_USE("terms-2026-09-30", "2026-09-30"),
    PRIVACY_NOTICE("privacy-2026-09-30", "2026-09-30")
}

data class LegalSection(val heading: String, val body: String)

data class LocalizedLegalDocument(
    val document: LegalDocument,
    val title: String,
    val effectiveDate: String,
    val sections: List<LegalSection>
)

object LegalDocuments {
    const val ACCEPTANCE_SOURCE = "android_native"
    const val ENGLISH = "en"
    const val BANGLA = "bn"

    fun normalizeLocale(value: String): String = if (value.lowercase().startsWith("bn")) BANGLA else ENGLISH

    fun document(document: LegalDocument, locale: String): LocalizedLegalDocument = when (normalizeLocale(locale)) {
        BANGLA -> bangla(document)
        else -> english(document)
    }

    private fun english(document: LegalDocument): LocalizedLegalDocument = when (document) {
        LegalDocument.TERMS_OF_USE -> LocalizedLegalDocument(
            document = document,
            title = "BSDC Terms of Use",
            effectiveDate = "30 September 2026",
            sections = listOf(
                LegalSection(
                    "1. Community service",
                    "Bangladesh Software Development Community, operated by RRC Development, provides a developer community service through this native Android app. These terms govern your use of a BSDC account and the service."
                ),
                LegalSection(
                    "2. Your account",
                    "Provide accurate account information, protect your sign-in methods, and do not share your account or create accounts for another person without permission. You are responsible for activity from your account where permitted by applicable law."
                ),
                LegalSection(
                    "3. Community conduct",
                    "Do not use BSDC to harass, threaten, deceive, impersonate, distribute malware, infringe rights, publish unlawful content, evade moderation, scrape the service, or interfere with its security or operation. Follow applicable law and the rights of other members."
                ),
                LegalSection(
                    "4. Your content",
                    "You retain ownership of content you create. You grant BSDC the limited, non-exclusive right needed to host, reproduce, transmit, and display that content solely to operate, secure, and improve the service according to the visibility you choose. You confirm that you have the rights needed to share it. Public posts and profile information can be viewed and reshared by other members or visitors where the service permits."
                ),
                LegalSection(
                    "5. Moderation and availability",
                    "BSDC may investigate reports and remove, limit, or preserve content or accounts when reasonably necessary for safety, legal compliance, service integrity, or these terms. The service can change, pause, or end; do not rely on it as the only copy of important work."
                ),
                LegalSection(
                    "6. Changes and contact",
                    "Material changes require a new version and a new acceptance gate before continued use. Questions about these terms can be sent to hello@bsdc.info.bd. This bundled notice requires review and approval by BSDC’s authorized legal owner before a production legal launch."
                )
            )
        )
        LegalDocument.PRIVACY_NOTICE -> LocalizedLegalDocument(
            document = document,
            title = "BSDC Privacy Notice",
            effectiveDate = "30 September 2026",
            sections = listOf(
                LegalSection(
                    "1. Controller and scope",
                    "BSDC/RRC Development is responsible for this Android app’s community data practices. This notice explains the data used by the native app. For privacy questions, contact hello@bsdc.info.bd."
                ),
                LegalSection(
                    "2. Data BSDC processes",
                    "BSDC processes Firebase account identifiers, your profile and handle, posts, comments, reactions, follows, reports, notification preferences and device push token. Direct and group messages are processed through Firebase Realtime Database. Messages are access-controlled but are not end-to-end encrypted. Content and profile media you choose to upload are sent to the configured Cloudinary service."
                ),
                LegalSection(
                    "3. Why it is used",
                    "This data is used to authenticate members, show community content, deliver messages and notifications, prevent abuse, operate moderation and safety controls, and maintain the service. Public profile fields and public posts are visible to other people."
                ),
                LegalSection(
                    "4. Optional device features",
                    "Camera, approximate location, contacts, microphone, and notifications are requested only when you choose their related feature. Approximate location is used only to suggest a city label that you review; raw coordinates are not stored or sent to BSDC. A selected invite contact is used only to prepare an external email or SMS draft and is not stored by BSDC."
                ),
                LegalSection(
                    "5. Analytics and service providers",
                    "Firebase Analytics is disabled by default and is enabled only after your explicit in-app choice. Firebase provides authentication, database, notification, and optional analytics services. Cloudinary processes chosen image and audio uploads. These providers may process data in regions outside your location under their own service terms and safeguards."
                ),
                LegalSection(
                    "6. Retention, security, and choices",
                    "BSDC retains data for as long as needed to operate, secure, comply with obligations, resolve disputes, and enforce rules. You can edit public profile fields, remove a public profile-photo reference, revoke optional device-feature choices, and turn analytics off in the app. No self-service full account export or deletion workflow is claimed by this version; those rights requests require a reviewed, authenticated lifecycle process before production launch."
                ),
                LegalSection(
                    "7. Updates",
                    "A material privacy change will be assigned a new version and require a new acceptance before use continues. This notice is product documentation, not jurisdiction-specific legal advice, and requires review by BSDC’s authorized legal owner before a production legal launch."
                )
            )
        )
    }

    private fun bangla(document: LegalDocument): LocalizedLegalDocument = when (document) {
        LegalDocument.TERMS_OF_USE -> LocalizedLegalDocument(
            document = document,
            title = "BSDC ব্যবহারের শর্তাবলি",
            effectiveDate = "৩০ সেপ্টেম্বর ২০২৬",
            sections = listOf(
                LegalSection("১. কমিউনিটি সেবা", "RRC Development পরিচালিত Bangladesh Software Development Community এই নেটিভ Android অ্যাপের মাধ্যমে ডেভেলপার কমিউনিটি সেবা দেয়। আপনার BSDC অ্যাকাউন্ট ও সেবা ব্যবহারে এই শর্তাবলি প্রযোজ্য।"),
                LegalSection("২. আপনার অ্যাকাউন্ট", "সঠিক তথ্য দিন, সাইন-ইন পদ্ধতি নিরাপদে রাখুন এবং অনুমতি ছাড়া অন্য কারও জন্য অ্যাকাউন্ট তৈরি বা নিজের অ্যাকাউন্ট ভাগ করবেন না। প্রযোজ্য আইনে অনুমোদিত সীমার মধ্যে অ্যাকাউন্টের কার্যকলাপের জন্য আপনি দায়ী থাকবেন।"),
                LegalSection("৩. কমিউনিটি আচরণ", "হয়রানি, হুমকি, প্রতারণা, ছদ্মবেশ, ম্যালওয়্যার ছড়ানো, অধিকার লঙ্ঘন, বেআইনি কনটেন্ট প্রকাশ, মডারেশন এড়িয়ে চলা, স্ক্র্যাপিং বা সেবার নিরাপত্তা ব্যাহত করতে BSDC ব্যবহার করা যাবে না।"),
                LegalSection("৪. আপনার কনটেন্ট", "আপনার তৈরি কনটেন্টের মালিকানা আপনারই থাকে। আপনার নির্বাচিত দৃশ্যমানতা অনুযায়ী সেবা চালানো, সুরক্ষিত রাখা ও উন্নত করার জন্য কনটেন্ট হোস্ট, প্রতিলিপি, প্রেরণ ও প্রদর্শনের সীমিত, অ-একচেটিয়া অধিকার BSDC-কে দেন। কনটেন্ট শেয়ার করার প্রয়োজনীয় অধিকার আপনার আছে বলে আপনি নিশ্চিত করেন।"),
                LegalSection("৫. মডারেশন ও সেবা", "নিরাপত্তা, আইন মানা, সেবার অখণ্ডতা বা এই শর্তাবলির জন্য যুক্তিসংগত প্রয়োজন হলে BSDC রিপোর্ট তদন্ত করতে এবং কনটেন্ট বা অ্যাকাউন্ট সরাতে, সীমিত করতে বা সংরক্ষণ করতে পারে। সেবা পরিবর্তিত, বিরত বা বন্ধ হতে পারে; গুরুত্বপূর্ণ কাজের একমাত্র কপি এখানে রাখবেন না।"),
                LegalSection("৬. পরিবর্তন ও যোগাযোগ", "গুরুত্বপূর্ণ পরিবর্তনের জন্য নতুন সংস্করণ ও পুনরায় সম্মতি দরকার হবে। প্রশ্ন hello@bsdc.info.bd-এ পাঠানো যায়। উৎপাদন পর্যায়ে আইনি চালুর আগে এই নথি BSDC-র অনুমোদিত আইনগত মালিকের পর্যালোচনা ও অনুমোদন প্রয়োজন।")
            )
        )
        LegalDocument.PRIVACY_NOTICE -> LocalizedLegalDocument(
            document = document,
            title = "BSDC গোপনীয়তা বিজ্ঞপ্তি",
            effectiveDate = "৩০ সেপ্টেম্বর ২০২৬",
            sections = listOf(
                LegalSection("১. দায়িত্বশীল পক্ষ ও পরিধি", "BSDC/RRC Development এই Android অ্যাপের কমিউনিটি ডেটা ব্যবহারের জন্য দায়িত্বশীল। গোপনীয়তার প্রশ্ন hello@bsdc.info.bd-এ পাঠান।"),
                LegalSection("২. BSDC যে ডেটা ব্যবহার করে", "BSDC Firebase অ্যাকাউন্ট শনাক্তকারী, প্রোফাইল ও হ্যান্ডেল, পোস্ট, মন্তব্য, প্রতিক্রিয়া, ফলো, রিপোর্ট, নোটিফিকেশন পছন্দ ও ডিভাইস পুশ টোকেন ব্যবহার করে। সরাসরি ও গ্রুপ মেসেজ Firebase Realtime Database-এ প্রক্রিয়াকৃত হয়। মেসেজে প্রবেশাধিকার নিয়ন্ত্রিত, তবে এগুলো end-to-end encrypted নয়। আপনার নির্বাচিত ছবি ও অডিও কনফিগার করা Cloudinary সেবায় পাঠানো হয়।"),
                LegalSection("৩. কেন ব্যবহার করা হয়", "সদস্য প্রমাণীকরণ, কমিউনিটি কনটেন্ট দেখানো, মেসেজ ও নোটিফিকেশন দেওয়া, অপব্যবহার প্রতিরোধ, মডারেশন এবং সেবা পরিচালনার জন্য এই ডেটা ব্যবহৃত হয়। পাবলিক প্রোফাইল ও পাবলিক পোস্ট অন্যরা দেখতে ও শেয়ার করতে পারে।"),
                LegalSection("৪. ঐচ্ছিক ডিভাইস ফিচার", "ক্যামেরা, আনুমানিক অবস্থান, পরিচিতি, মাইক্রোফোন ও নোটিফিকেশন শুধু আপনি সংশ্লিষ্ট ফিচার বেছে নিলে অনুরোধ করা হয়। আনুমানিক অবস্থান শুধু আপনার পর্যালোচনা করা শহরের লেবেল প্রস্তাবের জন্য; কাঁচা স্থানাঙ্ক BSDC-তে সংরক্ষণ বা পাঠানো হয় না। নির্বাচিত পরিচিতি শুধু বাইরের ইমেইল/SMS খসড়া তৈরিতে ব্যবহৃত হয় এবং BSDC সংরক্ষণ করে না।"),
                LegalSection("৫. অ্যানালিটিক্স ও সেবা প্রদানকারী", "Firebase Analytics শুরুতে বন্ধ থাকে এবং শুধুমাত্র আপনার স্পষ্ট ইন-অ্যাপ পছন্দে চালু হয়। Firebase প্রমাণীকরণ, ডেটাবেজ, নোটিফিকেশন ও ঐচ্ছিক অ্যানালিটিক্স দেয়; Cloudinary নির্বাচিত ছবি ও অডিও প্রক্রিয়া করে। তাদের নিজস্ব শর্ত ও সুরক্ষার অধীনে তারা আপনার অবস্থানের বাইরের অঞ্চলে ডেটা প্রক্রিয়া করতে পারে।"),
                LegalSection("৬. সংরক্ষণ, নিরাপত্তা ও পছন্দ", "সেবা চালানো, সুরক্ষিত রাখা, বাধ্যবাধকতা পালন, বিরোধ নিষ্পত্তি ও নিয়ম প্রয়োগে প্রয়োজনীয় সময় BSDC ডেটা রাখে। অ্যাপ থেকে পাবলিক প্রোফাইল সম্পাদনা, পাবলিক প্রোফাইল-ছবির রেফারেন্স অপসারণ, ঐচ্ছিক ফিচারের সম্মতি প্রত্যাহার ও অ্যানালিটিক্স বন্ধ করা যায়। এই সংস্করণে পূর্ণ অ্যাকাউন্ট রপ্তানি বা মুছে ফেলার স্ব-পরিসেবা দাবি করা হচ্ছে না; উৎপাদনের আগে এসব অনুরোধের জন্য পর্যালোচিত ও প্রমাণীকৃত প্রক্রিয়া প্রয়োজন।"),
                LegalSection("৭. হালনাগাদ", "গুরুত্বপূর্ণ গোপনীয়তা পরিবর্তনে নতুন সংস্করণ দেওয়া হবে এবং ব্যবহারের আগে পুনরায় সম্মতি নেওয়া হবে। এটি নির্দিষ্ট বিচারব্যবস্থার আইনি পরামর্শ নয় এবং উৎপাদন আইনি চালুর আগে BSDC-র অনুমোদিত আইনগত মালিকের পর্যালোচনা প্রয়োজন।")
            )
        )
    }
}
