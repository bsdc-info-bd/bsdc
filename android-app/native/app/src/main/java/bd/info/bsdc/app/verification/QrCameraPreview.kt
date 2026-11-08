package bd.info.bsdc.app.verification

import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.content.ContextCompat
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.google.mlkit.vision.barcode.BarcodeScanner
import com.google.mlkit.vision.barcode.BarcodeScannerOptions
import com.google.mlkit.vision.barcode.BarcodeScanning
import com.google.mlkit.vision.barcode.common.Barcode
import com.google.mlkit.vision.common.InputImage
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@Composable
fun QrCameraPreview(modifier: Modifier = Modifier, onCode: (String) -> Unit, onError: (String) -> Unit) {
    val context = LocalContext.current
    val owner = LocalLifecycleOwner.current
    var previewView by remember { mutableStateOf<PreviewView?>(null) }
    val executor = remember { Executors.newSingleThreadExecutor() }
    val scanner = remember {
        BarcodeScanning.getClient(BarcodeScannerOptions.Builder().setBarcodeFormats(Barcode.FORMAT_QR_CODE).build())
    }
    val delivered = remember { AtomicBoolean(false) }

    AndroidView(modifier = modifier, factory = { ctx -> PreviewView(ctx).apply {
        scaleType = PreviewView.ScaleType.FILL_CENTER
        implementationMode = PreviewView.ImplementationMode.COMPATIBLE
    }.also { previewView = it } })

    DisposableEffect(previewView) {
        val view = previewView
        if (view == null) return@DisposableEffect onDispose { }
        var provider: ProcessCameraProvider? = null
        val active = AtomicBoolean(true)
        run {
            val future = ProcessCameraProvider.getInstance(context)
            future.addListener({
                if (!active.get()) return@addListener
                try {
                    val cameraProvider = future.get()
                    if (!active.get()) return@addListener
                    provider = cameraProvider
                    val preview = Preview.Builder().build().also { it.surfaceProvider = view.surfaceProvider }
                    val analysis = ImageAnalysis.Builder()
                        .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                        .build()
                    analysis.setAnalyzer(executor) { image -> analyze(image, scanner, delivered, active, onCode, onError) }
                    cameraProvider.unbindAll()
                    cameraProvider.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                } catch (_: Exception) {
                    onError("The camera could not be started. Try manual code entry or check camera access.")
                }
            }, ContextCompat.getMainExecutor(context))
        }
        onDispose {
            active.set(false)
            provider?.unbindAll()
            scanner.close()
            executor.shutdown()
        }
    }
}

private fun analyze(image: ImageProxy, scanner: BarcodeScanner, delivered: AtomicBoolean, active: AtomicBoolean, onCode: (String) -> Unit, onError: (String) -> Unit) {
    val mediaImage = image.image
    if (mediaImage == null) { image.close(); return }
    val input = InputImage.fromMediaImage(mediaImage, image.imageInfo.rotationDegrees)
    scanner.process(input)
        .addOnSuccessListener { barcodes ->
            val raw = barcodes.firstOrNull { it.format == Barcode.FORMAT_QR_CODE }?.rawValue
            if (active.get() && !raw.isNullOrBlank() && delivered.compareAndSet(false, true)) onCode(raw)
        }
        .addOnFailureListener { if (active.get()) onError("Couldn't read that QR code. Adjust distance and lighting, then try again.") }
        .addOnCompleteListener { image.close() }
}
