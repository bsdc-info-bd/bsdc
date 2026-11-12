package bd.info.bsdc.app.feature.verify

import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.rounded.CameraAlt
import androidx.compose.material.icons.rounded.FlashlightOff
import androidx.compose.material.icons.rounded.FlashlightOn
import androidx.compose.material.icons.rounded.QrCodeScanner
import androidx.compose.material3.FilledTonalIconButton
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import bd.info.bsdc.app.core.designsystem.BsdcButton
import bd.info.bsdc.app.core.designsystem.BsdcCard
import bd.info.bsdc.app.core.designsystem.BsdcThemeTokens
import bd.info.bsdc.app.core.model.AppLanguage
import bd.info.bsdc.app.core.model.DevicePermissionKind
import bd.info.bsdc.app.core.model.PermissionGrantState
import bd.info.bsdc.app.core.permissions.rememberPermissionCoordinator
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@OptIn(ExperimentalGetImage::class)
@Composable
fun QrCameraScannerCard(
    language: AppLanguage,
    onScannedValue: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val bn = language == AppLanguage.BN
    val context = LocalContext.current
    val lifecycleOwner = LocalLifecycleOwner.current
    val permissionCoordinator = rememberPermissionCoordinator()
    val cameraState = permissionCoordinator.states[DevicePermissionKind.CAMERA]
        ?: PermissionGrantState.NEEDS_REQUEST

    var torchEnabled by remember { mutableStateOf(false) }
    var lastError by remember { mutableStateOf<String?>(null) }
    var cameraRef by remember { mutableStateOf<Camera?>(null) }

    if (cameraState != PermissionGrantState.GRANTED) {
        BsdcCard(modifier = modifier.fillMaxWidth()) {
            Column(
                modifier = Modifier.padding(18.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.CameraAlt,
                        contentDescription = null,
                        tint = BsdcThemeTokens.colors.brandStrong,
                    )
                    Text(
                        text = if (bn) "QR স্ক্যানারের জন্য ক্যামেরা অনুমতি প্রয়োজন" else "Camera access needed for QR scan",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Text(
                    text = if (bn) {
                        "BSDC সার্টিফিকেট, অফিশিয়াল নোটিশ, স্টাফ আইডি এবং রিপোর্ট PDF-এর QR কোড সরাসরি স্ক্যান করতে ক্যামেরার অনুমতি দিন।"
                    } else {
                        "Allow Camera access to scan QR codes printed on BSDC certificates, official notices, staff ID cards, and performance reports."
                    },
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (cameraState == PermissionGrantState.PERMANENTLY_DENIED_OPEN_SETTINGS) {
                    BsdcButton(
                        label = if (bn) "অ্যাপ সেটিংস খুলুন" else "Open App Settings",
                        onClick = { permissionCoordinator.openAppSettings() },
                        modifier = Modifier.fillMaxWidth(),
                    )
                } else {
                    BsdcButton(
                        label = if (bn) "ক্যামেরা চালু করুন" else "Allow Camera & Scan",
                        onClick = { permissionCoordinator.request(DevicePermissionKind.CAMERA) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        }
        return
    }

    val analyzerExecutor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(
            BarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                .build(),
        )
    }
    val handledOnce = remember { AtomicBoolean(false) }

    val previewView = remember {
        PreviewView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }

    DisposableEffect(lifecycleOwner, previewView) {
        val future = ProcessCameraProvider.getInstance(context)
        var provider: ProcessCameraProvider? = null

        val listener = Runnable {
            runCatching {
                provider = future.get()
                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = previewView.surfaceProvider
                }
                val analysis = ImageAnalysis.Builder()
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                analysis.setAnalyzer(analyzerExecutor) { imageProxy ->
                    val mediaImage = imageProxy.image
                    if (mediaImage == null || handledOnce.get()) {
                        imageProxy.close()
                        return@setAnalyzer
                    }
                    val input = InputImage.fromMediaImage(
                        mediaImage,
                        imageProxy.imageInfo.rotationDegrees,
                    )
                    scanner.process(input)
                        .addOnSuccessListener { barcodes ->
                            val value = barcodes.firstNotNullOfOrNull { it.rawValue?.trim() }
                            if (!value.isNullOrBlank() && handledOnce.compareAndSet(false, true)) {
                                ContextCompat.getMainExecutor(context).execute {
                                    onScannedValue(value)
                                }
                            }
                        }
                        .addOnFailureListener { exc ->
                            lastError = exc.localizedMessage
                        }
                        .addOnCompleteListener {
                            imageProxy.close()
                        }
                }

                provider?.unbindAll()
                val boundCamera = provider?.bindToLifecycle(
                    lifecycleOwner,
                    CameraSelector.DEFAULT_BACK_CAMERA,
                    preview,
                    analysis,
                )
                cameraRef = boundCamera
                boundCamera?.cameraControl?.enableTorch(torchEnabled)
            }.onFailure { err ->
                lastError = err.localizedMessage ?: "Camera unavailable on this device."
            }
        }
        future.addListener(listener, ContextCompat.getMainExecutor(context))

        onDispose {
            runCatching { cameraRef?.cameraControl?.enableTorch(false) }
            runCatching { provider?.unbindAll() }
            runCatching { scanner.close() }
            runCatching { analyzerExecutor.shutdown() }
        }
    }

    BsdcCard(modifier = modifier.fillMaxWidth()) {
        Column(
            modifier = Modifier.padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    Icon(
                        imageVector = Icons.Rounded.QrCodeScanner,
                        contentDescription = null,
                        tint = BsdcThemeTokens.colors.brandStrong,
                    )
                    Text(
                        text = if (bn) "লাইভ QR স্ক্যানার" else "Live QR Scanner",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                FilledTonalIconButton(
                    onClick = {
                        torchEnabled = !torchEnabled
                        cameraRef?.cameraControl?.enableTorch(torchEnabled)
                    },
                ) {
                    Icon(
                        imageVector = if (torchEnabled) Icons.Rounded.FlashlightOn else Icons.Rounded.FlashlightOff,
                        contentDescription = if (bn) "ফ্ল্যাশলাইট" else "Toggle flashlight",
                    )
                }
            }

            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1.1f)
                    .clip(RoundedCornerShape(16.dp))
                    .background(Color.Black),
                contentAlignment = Alignment.Center,
            ) {
                AndroidView(
                    factory = { previewView },
                    modifier = Modifier.fillMaxSize(),
                )
                Surface(
                    modifier = Modifier.size(200.dp),
                    color = Color.Transparent,
                    shape = RoundedCornerShape(18.dp),
                    border = BorderStroke(2.5.dp, BsdcThemeTokens.colors.brandStrong),
                ) {}
            }

            Text(
                text = if (bn) {
                    "কাগজের QR কোডটি সবুজ বক্সের ভেতরে ধরুন — স্ক্যান হতেই স্বয়ংক্রিয়ভাবে যাচাই শুরু হবে।"
                } else {
                    "Align any BSDC QR code inside the frame — verification triggers automatically."
                },
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
            )

            if (!lastError.isNullOrBlank()) {
                Text(
                    text = lastError.orEmpty(),
                    style = MaterialTheme.typography.labelMedium,
                    color = MaterialTheme.colorScheme.error,
                )
            }
            Spacer(modifier = Modifier.height(2.dp))
        }
    }
}
