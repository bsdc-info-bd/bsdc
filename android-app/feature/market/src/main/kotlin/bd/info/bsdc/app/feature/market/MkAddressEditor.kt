package bd.info.bsdc.app.feature.market

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import bd.info.bsdc.app.core.designsystem.BsdcStatusBanner
import bd.info.bsdc.app.core.designsystem.BsdcTone

/**
 * One saved doorstep, being created or edited. It lives beside the checkout rather than in an
 * account screen because that is where the need to save a door appears, and a member who has just
 * been refused delivery by a shop does not want to go looking for a settings page.
 *
 * Every limit here is `mk_save_address`'s, applied in the routine's order, so the Save button goes
 * grey for exactly the rows the routine would refuse and for no others. The phone is the one field
 * that is judged after being stripped of separators, because the routine strips it too — a member
 * who types 01712-345678 has given a valid number, and marking it wrong is how a form teaches
 * people to stop trusting it.
 *
 * [currentPin] is the pin the checkout is already holding. A new row takes it without asking again,
 * which is the entire convenience the feature is for; an edit keeps the row's own pin, so saving a
 * nickname cannot silently move somebody's door.
 */
@Composable
fun MkAddressEditor(
    bn: Boolean,
    initial: MkSavedAddressDto?,
    currentPin: Pair<Double, Double>?,
    currentPlaceLabel: String,
    onCancel: () -> Unit,
    onSave: (MkAddressInput) -> Unit,
    modifier: Modifier = Modifier,
) {
    var label by remember(initial) { mutableStateOf(initial?.label ?: "home") }
    var nickname by remember(initial) { mutableStateOf(initial?.nickname ?: "") }
    var name by remember(initial) { mutableStateOf(initial?.customer_name ?: "") }
    var phone by remember(initial) { mutableStateOf(initial?.customer_phone ?: "") }
    var line by remember(initial) { mutableStateOf(initial?.address_line ?: "") }
    var landmark by remember(initial) { mutableStateOf(initial?.landmark ?: "") }
    var placeLabel by remember(initial) { mutableStateOf(initial?.place_label ?: currentPlaceLabel) }
    var note by remember(initial) { mutableStateOf(initial?.note ?: "") }
    var isDefault by remember(initial) { mutableStateOf(initial?.is_default ?: false) }
    // An edit keeps its own pin; a new row inherits the one the checkout is holding. Null is not a
    // pin "outside Bangladesh" — the two have different meanings and the check below keeps them apart.
    var pin by remember(initial) {
        mutableStateOf(initial?.let { it.lat to it.lng } ?: currentPin)
    }

    val check = MkLogic.checkAddressDraft(
        name = name,
        phone = phone,
        line = line,
        nickname = nickname,
        label = label,
        lat = pin?.first,
        lng = pin?.second,
    )
    // A member who cannot save should not have to hunt for why. One line, in the order the fields
    // appear on this sheet.
    val blockedOn: String? = when {
        check.name -> mkText(bn, "The name needs 2-80 characters.", "নাম ২–৮০ অক্ষর হতে হবে।")
        check.phone -> mkText(bn, "Enter a Bangladeshi mobile number (01X…).", "বাংলাদেশের মোবাইল নম্বর দিন (০১এ…)।")
        check.line -> mkText(bn, "The address needs 5-240 characters.", "ঠিকানা ৫–২৪০ অক্ষর হতে হবে।")
        check.nickname -> mkText(bn, "The short name can be up to 40 characters.", "ডাক ৪০ অক্ষর পর্যন্ত হতে পারে।")
        check.label -> mkText(bn, "Choose one of the three labels.", "তিনটি লেবেলের একটি বেছে নিন।")
        check.pin -> mkText(
            bn,
            if (pin == null) "Add a pin from the checkout map first." else "The pin is outside Bangladesh.",
            if (pin == null) "আগে চেকআউটের মানচিত্র থেকে পিন দিন।" else "পিন বাংলাদেশের বাইরে।",
        )
        else -> null
    }

    AlertDialog(
        onDismissRequest = onCancel,
        modifier = modifier,
        title = {
            Text(
                text = if (initial == null) {
                    mkText(bn, "Save an address", "একটি ঠিকানা সংরক্ষণ করুন")
                } else {
                    mkText(bn, "Edit this address", "এই ঠিকানা সম্পাদনা করুন")
                },
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.Bold,
            )
        },
        text = {
            Column(
                verticalArrangement = Arrangement.spacedBy(10.dp),
                modifier = Modifier.verticalScroll(rememberScrollState()).padding(vertical = 4.dp),
            ) {
                Text(
                    text = mkText(bn, "What kind of place is it?", "কী ধরনের জায়গা?"),
                    style = MaterialTheme.typography.labelLarge,
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    MkLogic.ADDRESS_LABELS.forEach { key ->
                        FilterChip(
                            selected = label == key,
                            onClick = { label = key },
                            label = { Text(MkLogic.addressLabel(key, bn)) },
                        )
                    }
                }
                OutlinedTextField(
                    value = nickname,
                    onValueChange = { nickname = it },
                    label = { Text(mkText(bn, "A name only you will read (optional)", "শুধু আপনি চেনেন এমন ডাক (ঐচ্ছিক)")) },
                    isError = check.nickname,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = name,
                    onValueChange = { name = it },
                    label = { Text(mkText(bn, "Who receives it", "কে পাবেন")) },
                    isError = check.name,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = phone,
                    onValueChange = { phone = it },
                    label = { Text(mkText(bn, "Phone", "ফোন")) },
                    isError = check.phone,
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = line,
                    onValueChange = { line = it },
                    label = { Text(mkText(bn, "House, road, area", "বাসা, রাস্তা, এলাকা")) },
                    isError = check.line,
                    minLines = 2,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = landmark,
                    onValueChange = { landmark = it },
                    label = { Text(mkText(bn, "Landmark (optional)", "ল্যান্ডমার্ক (ঐচ্ছিক)")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = placeLabel,
                    onValueChange = { placeLabel = it },
                    label = { Text(mkText(bn, "Area name under the pin (optional)", "পিনের নিচের এলাকার নাম (ঐচ্ছিক)")) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it },
                    label = { Text(mkText(bn, "Standing note for shops (optional)", "দোকানের জন্য সবসময়ের নোট (ঐচ্ছিক)")) },
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable { isDefault = !isDefault }
                        .padding(vertical = 4.dp),
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(mkText(bn, "My default address", "আমার মূল ঠিকানা"))
                        Text(
                            text = mkText(
                                bn,
                                "Checked first at every checkout.",
                                "প্রতিটি চেকআউটে আগে দেখানো হবে।",
                            ),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                    Switch(checked = isDefault, onCheckedChange = { isDefault = it })
                }
                blockedOn?.let {
                    BsdcStatusBanner(
                        title = mkText(bn, "Not ready yet", "এখনো তৈরি নয়"),
                        body = it,
                        tone = BsdcTone.WARN,
                    )
                }
            }
        },
        confirmButton = {
            Button(
                enabled = blockedOn == null,
                onClick = {
                    val point = pin ?: return@Button
                    onSave(
                        MkAddressInput(
                            customerName = name.trim(),
                            customerPhone = phone.trim(),
                            addressLine = line.trim(),
                            lat = point.first,
                            lng = point.second,
                            landmark = landmark.trim(),
                            placeLabel = placeLabel.trim(),
                            note = note.trim(),
                            id = initial?.id,
                            label = label,
                            nickname = nickname.trim(),
                            isDefault = isDefault,
                        ),
                    )
                },
            ) {
                Text(mkText(bn, "Save", "সংরক্ষণ"))
            }
        },
        dismissButton = { TextButton(onClick = onCancel) { Text(mkText(bn, "Back", "ফিরে যান")) } },
    )
}
