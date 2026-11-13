package bd.info.bsdc.app.feature.verify

import android.graphics.ImageFormat
import android.util.Size
import android.view.ViewGroup
import androidx.annotation.OptIn
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.ExperimentalGetImage
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
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
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import com.google.zxing.BinaryBitmap
import com.google.zxing.DecodeHintType
import com.google.zxing.PlanarYUVLuminanceSource
import com.google.zxing.common.HybridBinarizer
import com.google.zxing.qrcode.QRCodeReader
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
    val mlkitScanner: BarcodeScanner? = remember {
        runCatching {
            BarcodeScanning.getClient(
                BarcodeScannerOptions.Builder()
                    .setBarcodeFormats(Barcode.FORMAT_QR_CODE)
                    .build(),
            )
        }.getOrNull()
    }
    val zxingReader = remember { QRCodeReader() }
    val zxingHints = remember {
        mapOf(DecodeHintType.TRY_HARDER to true)
    }
    val handledOnce = remember { AtomicBoolean(false) }
    val isDisposed = remember { AtomicBoolean(false) }
    val useZxingFallback = remember { AtomicBoolean(mlkitScanner == null) }

    // TextureView (`COMPATIBLE`) avoids SurfaceView Z-order/teardown IllegalStateException inside Compose.
    val previewView = remember {
        PreviewView(context).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            implementationMode = PreviewView.ImplementationMode.COMPATIBLE
            scaleType = PreviewView.ScaleType.FILL_CENTER
        }
    }

    DisposableEffect(lifecycleOwner, previewView) {
        isDisposed.set(false)
        val future = ProcessCameraProvider.getInstance(context)
        val mainExecutor = ContextCompat.getMainExecutor(context)
        var provider: ProcessCameraProvider? = null
        var boundAnalysis: ImageAnalysis? = null

        val resolutionSelector = ResolutionSelector.Builder()
            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
            .setResolutionStrategy(
                ResolutionStrategy(
                    Size(1280, 720),
                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_HIGHER_THEN_LOWER,
                ),
            )
            .build()

        fun dispatchResult(raw: String) {
            val clean = raw.trim()
            if (clean.isNotEmpty() && !isDisposed.get() && handledOnce.compareAndSet(false, true)) {
                mainExecutor.execute {
                    if (!isDisposed.get()) {
                        onScannedValue(clean)
                    }
                }
            }
        }

        val listener = Runnable {
            if (isDisposed.get()) return@Runnable
            runCatching {
                val camProvider = future.get()
                if (isDisposed.get()) return@runCatching
                provider = camProvider

                val cameraSelector = when {
                    camProvider.hasCamera(CameraSelector.DEFAULT_BACK_CAMERA) -> CameraSelector.DEFAULT_BACK_CAMERA
                    camProvider.hasCamera(CameraSelector.DEFAULT_FRONT_CAMERA) -> CameraSelector.DEFAULT_FRONT_CAMERA
                    else -> {
                        lastError = if (bn) "এই ডিভাইসে ক্যামেরা পাওয়া যায়নি।" else "No camera hardware available on this device."
                        return@runCatching
                    }
                }

                val preview = Preview.Builder()
                    .setResolutionSelector(resolutionSelector)
                    .build()
                    .also { it.surfaceProvider = previewView.surfaceProvider }

                val analysis = ImageAnalysis.Builder()
                    .setResolutionSelector(resolutionSelector)
                    .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                    .build()
                boundAnalysis = analysis

                analysis.setAnalyzer(analyzerExecutor) { imageProxy ->
                    if (isDisposed.get() || handledOnce.get()) {
                        imageProxy.close()
                        return@setAnalyzer
                    }

                    val activeMlkit = if (!useZxingFallback.get()) mlkitScanner else null
                    val mediaImage = imageProxy.image

                    if (activeMlkit == null || mediaImage == null) {
                        try {
                            decodeQrWithZxing(imageProxy, zxingReader, zxingHints)?.let(::dispatchResult)
                        } finally {
                            imageProxy.close()
                        }
                        return@setAnalyzer
                    }

                    val input = try {
                        InputImage.fromMediaImage(mediaImage, imageProxy.imageInfo.rotationDegrees)
                    } catch (_: Throwable) {
                        useZxingFallback.set(true)
                        try {
                            decodeQrWithZxing(imageProxy, zxingReader, zxingHints)?.let(::dispatchResult)
                        } finally {
                            imageProxy.close()
                        }
                        return@setAnalyzer
                    }

                    try {
                        activeMlkit.process(input)
                            .addOnSuccessListener { barcodes ->
                                val value = barcodes.firstNotNullOfOrNull { it.rawValue?.trim() }
                                if (!value.isNullOrBlank()) {
                                    dispatchResult(value)
                                }
                            }
                            .addOnFailureListener {
                                // Play Services barcode module missing/offline on some ROMs; switch to pure-Java ZXing.
                                useZxingFallback.set(true)
                            }
                            .addOnCompleteListener {
                                imageProxy.close()
                            }
                    } catch (_: Throwable) {
                        useZxingFallback.set(true)
                        imageProxy.close()
                    }
                }

                camProvider.unbindAll()
                val boundCamera = camProvider.bindToLifecycle(
                    lifecycleOwner,
                    cameraSelector,
                    preview,
                    analysis,
                )
                cameraRef = boundCamera
                runCatching { boundCamera.cameraControl.enableTorch(torchEnabled) }
            }.onFailure { err ->
                lastError = err.localizedMessage ?: (if (bn) "এই ডিভাইসে ক্যামেরা চালু করা যায়নি।" else "Camera unavailable on this device.")
            }
        }
        future.addListener(listener, mainExecutor)

        onDispose {
            isDisposed.set(true)
            runCatching { boundAnalysis?.clearAnalyzer() }
            runCatching { cameraRef?.cameraControl?.enableTorch(false) }
            cameraRef = null
            runCatching { provider?.unbindAll() }
            runCatching { mlkitScanner?.close() }
            runCatching { analyzerExecutor.shutdownNow() }
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
                        runCatching { cameraRef?.cameraControl?.enableTorch(torchEnabled) }
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

private fun decodeQrWithZxing(
    imageProxy: ImageProxy,
    reader: QRCodeReader,
    hints: Map<DecodeHintType, Any>,
): String? {
    if (imageProxy.format != ImageFormat.YUV_420_888 || imageProxy.planes.isEmpty()) return null
    val width = imageProxy.width
    val height = imageProxy.height
    if (width <= 0 || height <= 0) return null

    val yPlane = imageProxy.planes[0]
    val buffer = yPlane.buffer
    val rowStride = yPlane.rowStride
    val pixelStride = yPlane.pixelStride
    if (pixelStride <= 0) return null

    val yBytes = ByteArray(width * height)
    val dup = buffer.duplicate()
    val limit = dup.limit()
    for (row in 0 until height) {
        val rowStart = row * rowStride
        if (rowStart >= limit) break
        if (pixelStride == 1) {
            dup.position(rowStart)
            val available = (limit - rowStart).coerceAtMost(width)
            dup.get(yBytes, row * width, available)
        } else {
            for (col in 0 until width) {
                val idx = rowStart + col * pixelStride
                if (idx >= limit) break
                yBytes[row * width + col] = dup.get(idx)
            }
        }
    }

    return runCatching {
        val source = PlanarYUVLuminanceSource(yBytes, width, height, 0, 0, width, height, false)
        val bitmap = BinaryBitmap(HybridBinarizer(source))
        reader.decode(bitmap, hints).text?.trim()
    }.also {
        runCatching { reader.reset() }
    }.getOrNull()
}
