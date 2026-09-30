package bd.info.bsdc.app.core

import bd.info.bsdc.app.auth.AuthRepository
import bd.info.bsdc.app.data.AccountLifecycleRepository
import bd.info.bsdc.app.data.CommunityRepository
import bd.info.bsdc.app.data.LegalConsentRepository
import bd.info.bsdc.app.data.ModerationRepository
import bd.info.bsdc.app.data.OrganizationRepository
import bd.info.bsdc.app.data.ProfileRepository
import bd.info.bsdc.app.data.SearchRepository
import bd.info.bsdc.app.media.CloudinaryMediaUploader
import bd.info.bsdc.app.messaging.ChatRepository
import bd.info.bsdc.app.notifications.NotificationRepository

/** Single application graph; dependencies remain explicit and testable without a DI framework. */
data class AppContainer(
    val settings: SettingsRepository,
    val auth: AuthRepository,
    val lifecycle: AccountLifecycleRepository,
    val legalConsents: LegalConsentRepository,
    val moderation: ModerationRepository,
    val community: CommunityRepository,
    val organizations: OrganizationRepository,
    val profiles: ProfileRepository,
    val search: SearchRepository,
    val chat: ChatRepository,
    val notifications: NotificationRepository,
    val media: CloudinaryMediaUploader
)
