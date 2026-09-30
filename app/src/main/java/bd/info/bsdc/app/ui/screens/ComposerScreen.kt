package bd.info.bsdc.app.ui.screens

import android.app.DatePickerDialog
import android.app.TimePickerDialog
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.content.PublishingTools
import bd.info.bsdc.app.model.PostVisibility
import bd.info.bsdc.app.ui.ComposerAction
import bd.info.bsdc.app.ui.ComposerViewModel
import bd.info.bsdc.app.ui.EditorMode
import bd.info.bsdc.app.ui.components.MarkdownDocument
import java.text.DateFormat
import java.util.Calendar

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ComposerScreen(viewModel: ComposerViewModel, onPublished: () -> Unit, onBack: () -> Unit, onOpenOrganization: (String) -> Unit = {}) {
    val state = viewModel.state.collectAsStateWithLifecycle().value
    val context = LocalContext.current
    val picker = rememberLauncherForActivityResult(ActivityResultContracts.OpenDocument()) { uri -> uri?.let(viewModel::attach) }
    var showDrafts by remember { mutableStateOf(false) }
    var showEmbed by remember { mutableStateOf(false) }
    var showSeries by remember { mutableStateOf(false) }
    var showOrganization by remember { mutableStateOf(false) }
    var showNewSeries by remember { mutableStateOf(false) }
    var showNewOrganization by remember { mutableStateOf(false) }
    var showCoAuthors by remember { mutableStateOf(false) }

    LaunchedEffect(state.completed) { if (state.completed) onPublished() }
    if (showDrafts) WorkingPostsDialog(
        posts = state.workingPosts,
        onSelect = { viewModel.loadWorkingPost(it); showDrafts = false },
        onDismiss = { showDrafts = false }
    )
    if (showEmbed) EmbedDialog(onInsert = { type, url -> viewModel.insertEmbed(type, url); showEmbed = false }, onDismiss = { showEmbed = false })
    if (showSeries) ChoiceDialog(
        title = "Add to a series",
        options = listOf("" to "No series") + state.series.map { it.id to it.title },
        selected = state.selectedSeriesId.orEmpty(),
        onSelect = { viewModel.selectSeries(it.ifBlank { null }); showSeries = false },
        onDismiss = { showSeries = false }
    )
    if (showOrganization) ChoiceDialog(
        title = "Publish with an organization",
        options = listOf("" to "Personal profile") + state.organizations.map { it.organizationId to it.organizationName },
        selected = state.selectedOrganizationId.orEmpty(),
        onSelect = { viewModel.selectOrganization(it.ifBlank { null }); showOrganization = false },
        onDismiss = { showOrganization = false }
    )
    if (showNewSeries) NewSeriesDialog(onCreate = { title, description -> viewModel.createSeries(title, description); showNewSeries = false }, onDismiss = { showNewSeries = false })
    if (showNewOrganization) NewOrganizationDialog(onCreate = { name, handle, description -> viewModel.createOrganization(name, handle, description); showNewOrganization = false }, onDismiss = { showNewOrganization = false })
    if (showCoAuthors) CoAuthorDialog(onAdd = { handles -> viewModel.addCoAuthors(handles); showCoAuthors = false }, onDismiss = { showCoAuthors = false })

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(if (state.draftId == null) "Write a post" else "Edit post") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Close") } },
                actions = {
                    TextButton(onClick = { showDrafts = true }) { Text("Drafts") }
                    TextButton(onClick = { viewModel.submit(ComposerAction.PUBLISH) }, enabled = !state.uploading && !state.publishing) { Text("Publish") }
                }
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).padding(horizontal = 16.dp).verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            ComposerIntro()
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                FilterChip(selected = state.editorMode == EditorMode.RICH, onClick = { viewModel.updateEditorMode(EditorMode.RICH) }, label = { Text("Rich write") })
                FilterChip(selected = state.editorMode == EditorMode.MARKDOWN, onClick = { viewModel.updateEditorMode(EditorMode.MARKDOWN) }, label = { Text("Markdown") })
                Spacer(Modifier.weight(1f))
                Text("${state.body.length}/10,000", style = MaterialTheme.typography.labelMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            WriterToolbar(onInsert = viewModel::insertMarkdown, onEmbed = { showEmbed = true })
            OutlinedTextField(
                value = state.body,
                onValueChange = viewModel::updateBody,
                modifier = Modifier.fillMaxWidth().height(230.dp),
                label = { Text(if (state.editorMode == EditorMode.MARKDOWN) "Markdown source" else "Your story") },
                placeholder = { Text("Share a lesson, project, question, or developer update…") },
                textStyle = if (state.editorMode == EditorMode.MARKDOWN) MaterialTheme.typography.bodyMedium.copy(fontFamily = FontFamily.Monospace) else MaterialTheme.typography.bodyLarge,
                minLines = 8,
                maxLines = 14
            )
            if (state.editorMode == EditorMode.RICH && state.body.isNotBlank()) {
                Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant), shape = RoundedCornerShape(16.dp)) {
                    Column(Modifier.padding(14.dp)) {
                        Text("Live formatted preview", style = MaterialTheme.typography.labelLarge)
                        MarkdownDocument(PublishingTools.withFrontmatter(state.body, PublishingTools.parseMetadataLines(state.metadataText)), Modifier.padding(top = 8.dp), maxLines = 8, showEmbeds = false)
                    }
                }
            }
            PublishingDetails(
                metadata = state.metadataText,
                onMetadata = viewModel::updateMetadata,
                tags = state.tags,
                onTags = viewModel::updateTags,
                language = state.language,
                onLanguage = viewModel::updateLanguage,
                visibility = state.visibility,
                onVisibility = viewModel::updateVisibility
            )
            AttachmentSection(state.media, state.uploading, onPick = { picker.launch(arrayOf("image/*", "audio/*")) }, onRemove = viewModel::removeMedia)
            SeriesSection(
                selectedTitle = state.series.firstOrNull { it.id == state.selectedSeriesId }?.title,
                onChoose = { showSeries = true },
                onNew = { showNewSeries = true }
            )
            OrganizationSection(
                selectedName = state.organizations.firstOrNull { it.organizationId == state.selectedOrganizationId }?.organizationName,
                hasOrganizations = state.organizations.isNotEmpty(),
                coAuthors = state.coAuthors,
                onChoose = { showOrganization = true },
                onNew = { showNewOrganization = true },
                onCoAuthors = { showCoAuthors = true },
                onManage = { state.selectedOrganizationId?.let(onOpenOrganization) },
                onRemoveCoAuthor = viewModel::removeCoAuthor
            )
            ScheduleSection(
                scheduledAtMillis = state.scheduledAtMillis,
                onChooseTime = {
                    val calendar = Calendar.getInstance().apply { timeInMillis = state.scheduledAtMillis ?: System.currentTimeMillis() + 3_600_000L }
                    DatePickerDialog(context, { _, year, month, day ->
                        TimePickerDialog(context, { _, hour, minute ->
                            val selected = Calendar.getInstance().apply { set(year, month, day, hour, minute, 0); set(Calendar.MILLISECOND, 0) }
                            viewModel.updateScheduledAt(selected.timeInMillis)
                        }, calendar.get(Calendar.HOUR_OF_DAY), calendar.get(Calendar.MINUTE), false).show()
                    }, calendar.get(Calendar.YEAR), calendar.get(Calendar.MONTH), calendar.get(Calendar.DAY_OF_MONTH)).show()
                },
                onClear = { viewModel.updateScheduledAt(null) },
                onSchedule = { viewModel.submit(ComposerAction.SCHEDULE) },
                enabled = !state.uploading && !state.publishing
            )
            state.error?.let { Text(it, color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodyMedium) }
            state.notice?.let { Text(it, color = MaterialTheme.colorScheme.primary, style = MaterialTheme.typography.bodyMedium) }
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                TextButton(onClick = { viewModel.submit(ComposerAction.DRAFT) }, enabled = !state.uploading && !state.publishing, modifier = Modifier.weight(1f)) { Text("Save private draft") }
                Button(onClick = { viewModel.submit(ComposerAction.PUBLISH) }, enabled = !state.uploading && !state.publishing, modifier = Modifier.weight(1f)) {
                    if (state.publishing) CircularProgressIndicator(Modifier.height(20.dp), strokeWidth = 2.dp) else Text("Publish now")
                }
            }
            Text(
                "BSDC accepts image and voice attachments only. YouTube tags are safe external links; the app does not upload or play video media.",
                modifier = Modifier.padding(bottom = 24.dp),
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

@Composable
private fun ComposerIntro() = Card(colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer), shape = RoundedCornerShape(18.dp)) {
    Column(Modifier.padding(16.dp)) {
        Text("Publish thoughtfully", style = MaterialTheme.typography.titleMedium, color = MaterialTheme.colorScheme.onPrimaryContainer)
        Text("Markdown is the portable source. Use the rich tools for an accessible, native preview — no HTML or executable content runs in BSDC.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onPrimaryContainer)
    }
}

@Composable
private fun WriterToolbar(onInsert: (String) -> Unit, onEmbed: () -> Unit) {
    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        AssistChip(onClick = { onInsert("**bold text**") }, label = { Text("Bold") })
        AssistChip(onClick = { onInsert("## Heading") }, label = { Text("Heading") })
        AssistChip(onClick = { onInsert("`code`") }, label = { Text("Code") })
        AssistChip(onClick = { onInsert("> A useful quote") }, label = { Text("Quote") })
        AssistChip(onClick = onEmbed, label = { Text("Embed") })
    }
}

@Composable
private fun PublishingDetails(
    metadata: String,
    onMetadata: (String) -> Unit,
    tags: String,
    onTags: (String) -> Unit,
    language: String,
    onLanguage: (String) -> Unit,
    visibility: PostVisibility,
    onVisibility: (PostVisibility) -> Unit
) = Card(shape = RoundedCornerShape(18.dp)) {
    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text("Discoverability & metadata", style = MaterialTheme.typography.titleSmall)
        OutlinedTextField(
            value = metadata,
            onValueChange = onMetadata,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Frontmatter fields") },
            placeholder = { Text("title: My post\ndescription: What readers will learn") },
            supportingText = { Text("Simple key: value fields are written to the top of the Markdown source.") },
            minLines = 3,
            maxLines = 6
        )
        OutlinedTextField(
            value = tags,
            onValueChange = onTags,
            modifier = Modifier.fillMaxWidth(),
            label = { Text("Tags — up to 4") },
            supportingText = { Text("Comma, space, or line separated. Example: kotlin, firebase, dhaka") }
        )
        Text("Language", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = language == "en", onClick = { onLanguage("en") }, label = { Text("English") })
            FilterChip(selected = language == "bn", onClick = { onLanguage("bn") }, label = { Text("বাংলা") })
        }
        Text("Audience", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            FilterChip(selected = visibility == PostVisibility.PUBLIC, onClick = { onVisibility(PostVisibility.PUBLIC) }, label = { Text("Public") })
            FilterChip(selected = visibility == PostVisibility.FOLLOWERS, onClick = { onVisibility(PostVisibility.FOLLOWERS) }, label = { Text("Followers") })
            FilterChip(selected = visibility == PostVisibility.ONLY_ME, onClick = { onVisibility(PostVisibility.ONLY_ME) }, label = { Text("Only me") })
        }
    }
}

@Composable
private fun AttachmentSection(media: List<bd.info.bsdc.app.model.MediaAttachment>, uploading: Boolean, onPick: () -> Unit, onRemove: (String) -> Unit) = Card(shape = RoundedCornerShape(18.dp)) {
    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Text("Attachments", style = MaterialTheme.typography.titleSmall)
        TextButton(onClick = onPick, enabled = !uploading) { Text(if (uploading) "Uploading securely…" else "Add image or voice note") }
        media.forEach { item ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(if (item.kind == "AUDIO") "Voice attachment" else "Image attachment")
                TextButton(onClick = { onRemove(item.url) }) { Text("Remove") }
            }
        }
    }
}

@Composable
private fun SeriesSection(selectedTitle: String?, onChoose: () -> Unit, onNew: () -> Unit) = Card(shape = RoundedCornerShape(18.dp)) {
    Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Column(Modifier.weight(1f)) {
            Text("Series", style = MaterialTheme.typography.titleSmall)
            Text(selectedTitle ?: "Group multi-part articles with a structured series header.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column {
            TextButton(onClick = onChoose) { Text("Choose") }
            TextButton(onClick = onNew) { Text("New") }
        }
    }
}

@Composable
private fun OrganizationSection(
    selectedName: String?,
    hasOrganizations: Boolean,
    coAuthors: List<bd.info.bsdc.app.ui.CoAuthorUi>,
    onChoose: () -> Unit,
    onNew: () -> Unit,
    onCoAuthors: () -> Unit,
    onManage: () -> Unit,
    onRemoveCoAuthor: (String) -> Unit
) = Card(shape = RoundedCornerShape(18.dp)) {
    Column(Modifier.padding(14.dp), verticalArrangement = Arrangement.spacedBy(7.dp)) {
        Text("Organization publishing", style = MaterialTheme.typography.titleSmall)
        Text(selectedName ?: "Publish under a shared BSDC organization profile.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onChoose, enabled = hasOrganizations) { Text("Choose profile") }
            TextButton(onClick = onNew) { Text("Create profile") }
        }
        if (selectedName != null) Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            TextButton(onClick = onCoAuthors) { Text("Co-authors") }
            TextButton(onClick = onManage) { Text("Manage team") }
        }
        coAuthors.forEach { author ->
            Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                Text(author.name, style = MaterialTheme.typography.bodyMedium)
                TextButton(onClick = { onRemoveCoAuthor(author.id) }) { Text("Remove") }
            }
        }
        if (selectedName != null) Text("Co-authors are credit lines. They do not receive editing access or see drafts automatically.", style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun ScheduleSection(scheduledAtMillis: Long?, onChooseTime: () -> Unit, onClear: () -> Unit, onSchedule: () -> Unit, enabled: Boolean) = Card(shape = RoundedCornerShape(18.dp)) {
    Row(Modifier.fillMaxWidth().padding(14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
        Column(Modifier.weight(1f)) {
            Text("Schedule publication", style = MaterialTheme.typography.titleSmall)
            Text(scheduledAtMillis?.let { DateFormat.getDateTimeInstance(DateFormat.MEDIUM, DateFormat.SHORT).format(it) } ?: "Choose a future time. The trusted Firebase scheduler publishes it.", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
        Column {
            TextButton(onClick = onChooseTime, enabled = enabled) { Text("Choose") }
            if (scheduledAtMillis != null) TextButton(onClick = onSchedule, enabled = enabled) { Text("Schedule") }
            if (scheduledAtMillis != null) TextButton(onClick = onClear, enabled = enabled) { Text("Clear") }
        }
    }
}

@Composable
private fun WorkingPostsDialog(posts: List<bd.info.bsdc.app.model.CommunityPost>, onSelect: (bd.info.bsdc.app.model.CommunityPost) -> Unit, onDismiss: () -> Unit) = AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text("Private drafts & scheduled posts") },
    text = {
        Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
            if (posts.isEmpty()) Text("No saved drafts yet.")
            posts.forEach { post ->
                TextButton(onClick = { onSelect(post) }, modifier = Modifier.fillMaxWidth()) {
                    Text((post.frontmatter["title"] ?: PublishingTools.splitFrontmatter(post.body).metadata["title"] ?: post.body.take(55)).ifBlank { "Untitled ${post.status}" })
                }
            }
        }
    },
    confirmButton = { TextButton(onClick = onDismiss) { Text("Done") } }
)

@Composable
private fun ChoiceDialog(title: String, options: List<Pair<String, String>>, selected: String, onSelect: (String) -> Unit, onDismiss: () -> Unit) = AlertDialog(
    onDismissRequest = onDismiss,
    title = { Text(title) },
    text = { Column { options.forEach { (id, label) -> FilterChip(selected = selected == id, onClick = { onSelect(id) }, label = { Text(label) }, modifier = Modifier.fillMaxWidth()) } } },
    confirmButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
)

@Composable
private fun EmbedDialog(onInsert: (String, String) -> Unit, onDismiss: () -> Unit) {
    var type by remember { mutableStateOf("gist") }
    var url by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Insert a safe embed") }, text = {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                listOf("gist", "codepen", "youtube", "twitter").forEach { item -> FilterChip(selected = type == item, onClick = { type = item }, label = { Text(item) }) }
            }
            OutlinedTextField(value = url, onValueChange = { url = it }, modifier = Modifier.fillMaxWidth(), label = { Text("Public URL") })
            Text("BSDC stores a Markdown liquid tag and opens supported embeds externally. YouTube is never uploaded or played as BSDC media.", style = MaterialTheme.typography.labelSmall)
        }
    }, confirmButton = { Button(onClick = { onInsert(type, url) }, enabled = url.isNotBlank()) { Text("Insert") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
private fun NewSeriesDialog(onCreate: (String, String) -> Unit, onDismiss: () -> Unit) {
    var title by remember { mutableStateOf("") }; var description by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("New series") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value = title, onValueChange = { title = it }, label = { Text("Series title") })
        OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Short description") })
    } }, confirmButton = { Button(onClick = { onCreate(title, description) }, enabled = title.trim().length >= 3) { Text("Create") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
private fun NewOrganizationDialog(onCreate: (String, String, String) -> Unit, onDismiss: () -> Unit) {
    var name by remember { mutableStateOf("") }; var handle by remember { mutableStateOf("") }; var description by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("New organization profile") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Organization name") })
        OutlinedTextField(value = handle, onValueChange = { handle = it }, label = { Text("Unique handle") })
        OutlinedTextField(value = description, onValueChange = { description = it }, label = { Text("Description") })
    } }, confirmButton = { Button(onClick = { onCreate(name, handle, description) }, enabled = name.trim().length >= 3 && handle.trim().length >= 3) { Text("Create") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}

@Composable
private fun CoAuthorDialog(onAdd: (String) -> Unit, onDismiss: () -> Unit) {
    var handles by remember { mutableStateOf("") }
    AlertDialog(onDismissRequest = onDismiss, title = { Text("Credit co-authors") }, text = { Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        OutlinedTextField(value = handles, onValueChange = { handles = it }, modifier = Modifier.fillMaxWidth(), label = { Text("BSDC handles") }, supportingText = { Text("Up to 5, separated by commas or spaces.") })
        Text("Co-authors are verified against real BSDC profiles before the post is saved.", style = MaterialTheme.typography.labelSmall)
    } }, confirmButton = { Button(onClick = { onAdd(handles) }, enabled = handles.isNotBlank()) { Text("Add") } }, dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } })
}
