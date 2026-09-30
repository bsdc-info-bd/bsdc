package bd.info.bsdc.app.ui.screens

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import bd.info.bsdc.app.model.TechnologyCatalog
import bd.info.bsdc.app.ui.ProfileViewModel

/** Real skill selection persisted to the signed-in member profile, with no default selections. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TechnologyStackScreen(viewModel: ProfileViewModel, onBack: () -> Unit) {
    val profile by viewModel.state.collectAsStateWithLifecycle()
    val action by viewModel.action.collectAsStateWithLifecycle()
    var query by remember { mutableStateOf("") }
    var category by remember { mutableStateOf<String?>(null) }
    var selected by remember(profile?.id) { mutableStateOf(profile?.skills.orEmpty().toSet()) }
    var customSkill by remember { mutableStateOf("") }

    val available = TechnologyCatalog.all.filter { technology ->
        (category == null || technology.category == category) &&
            (query.isBlank() || technology.name.contains(query.trim(), ignoreCase = true))
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Developer tech stack") },
                navigationIcon = { TextButton(onClick = onBack) { Text("Back") } },
                actions = { Text("${selected.size}/20", modifier = Modifier.padding(end = 14.dp), style = MaterialTheme.typography.labelLarge) }
            )
        },
        bottomBar = {
            Button(
                onClick = { viewModel.updateTechnologySkills(selected.toList().sorted()) },
                enabled = !action.busy && selected.isNotEmpty() && selected.size <= 20,
                modifier = Modifier.fillMaxWidth().padding(16.dp)
            ) { Text(if (action.busy) "Saving…" else "Save technology stack") }
        }
    ) { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize().padding(padding),
            contentPadding = PaddingValues(horizontal = 16.dp, vertical = 12.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            item("description") {
                Text("Choose the tools you actively use. These labels appear on your public BSDC profile and improve relevant developer discovery.", color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            item("search") {
                OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth(), label = { Text("Search languages, frameworks, tools") }, singleLine = true)
            }
            item("custom") {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    OutlinedTextField(customSkill, { customSkill = it }, Modifier.fillMaxWidth(), label = { Text("Add another technology") }, singleLine = true)
                    TextButton(
                        onClick = {
                            val value = customSkill.trim().take(48)
                            if (value.isNotBlank() && selected.size < 20) {
                                selected = selected + value
                                customSkill = ""
                            }
                        },
                        enabled = customSkill.trim().isNotBlank() && selected.size < 20
                    ) { Text("Add custom technology") }
                }
            }
            item("categories") {
                LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    item { FilterChip(selected = category == null, onClick = { category = null }, label = { Text("All") }) }
                    items(TechnologyCatalog.categories, key = { it }) { item ->
                        FilterChip(selected = category == item, onClick = { category = item }, label = { Text(item) })
                    }
                }
            }
            if (selected.isNotEmpty()) {
                item("selected") { Text("Selected technologies", style = MaterialTheme.typography.titleSmall) }
                items(selected.toList().sorted(), key = { "selected-$it" }) { technology ->
                    FilterChip(selected = true, onClick = { selected = selected - technology }, label = { Text(technology) })
                }
            }
            item("catalog-title") { Text("Technology catalog", style = MaterialTheme.typography.titleSmall) }
            items(available, key = { "${it.category}-${it.name}" }) { technology ->
                FilterChip(
                    selected = technology.name in selected,
                    onClick = {
                        selected = if (technology.name in selected) selected - technology.name
                        else if (selected.size < 20) selected + technology.name else selected
                    },
                    label = { Text("${technology.name} · ${technology.category}") }
                )
            }
            action.error?.let { error -> item("error") { Text(error, color = MaterialTheme.colorScheme.error) } }
            action.message?.let { message -> item("message") { Text(message, color = MaterialTheme.colorScheme.primary) } }
        }
    }
}
