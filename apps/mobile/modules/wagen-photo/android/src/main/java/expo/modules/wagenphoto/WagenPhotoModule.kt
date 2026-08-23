package expo.modules.wagenphoto

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.net.Uri
import android.renderscript.Allocation
import android.renderscript.Element
import android.renderscript.RenderScript
import android.renderscript.ScriptIntrinsicBlur
import com.google.android.gms.common.moduleinstall.ModuleInstall
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.segmentation.subject.SubjectSegmentation
import com.google.mlkit.vision.segmentation.subject.SubjectSegmenterOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream

/**
 * I1/I2 (4.4): capability detection + puni foto pipeline na Androidu.
 *
 * - isSubjectSegmentationAvailable: je li ML Kit subject segmentation modul
 *   prisutan na uredjaju (Google Play services ga isporucuje on-demand).
 * - requestSegmentationModule: zatrazi instalaciju modula (jednokratno).
 * - processPhoto: segmentacija subjekta + zamucena pozadina (default izlaz
 *   po 4.4 - zamjena predloskom je eksperimentalna i ceka v1.1).
 *
 * Stariji/nesposobni uredjaji: aplikacija degradira na blur-only pipeline
 * u JS sloju - ovaj modul tada javlja available=false i nista vise.
 */
class WagenPhotoModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("WagenPhoto")

    AsyncFunction("isSubjectSegmentationAvailable") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false); return@AsyncFunction
      }
      try {
        val client = SubjectSegmentation.getClient(
          SubjectSegmenterOptions.Builder()
            .enableForegroundConfidenceMask()
            .build()
        )
        ModuleInstall.getClient(context)
          .areModulesAvailable(client)
          .addOnSuccessListener { response -> promise.resolve(response.areModulesAvailable()) }
          .addOnFailureListener { promise.resolve(false) }
      } catch (e: Throwable) {
        promise.resolve(false)
      }
    }

    AsyncFunction("requestSegmentationModule") { promise: Promise ->
      val context = appContext.reactContext ?: run {
        promise.resolve(false); return@AsyncFunction
      }
      try {
        val client = SubjectSegmentation.getClient(
          SubjectSegmenterOptions.Builder()
            .enableForegroundConfidenceMask()
            .build()
        )
        val request = ModuleInstallRequest.newBuilder().addApi(client).build()
        ModuleInstall.getClient(context)
          .installModules(request)
          .addOnSuccessListener { promise.resolve(true) }
          .addOnFailureListener { promise.resolve(false) }
      } catch (e: Throwable) {
        promise.resolve(false)
      }
    }

    // processPhoto(uri, mode): mode 'segment_blur' (puni pipeline) ili
    // 'blur_only' (degradacija - blago zamucenje cijele pozadine nije
    // moguce bez maske, pa blur_only ovdje znaci: bez obrade pozadine).
    // Vraca file:// URI obradjene fotografije (JPEG).
    AsyncFunction("processPhoto") { uriString: String, promise: Promise ->
      val context = appContext.reactContext
        ?: return@AsyncFunction promise.reject(CodedException("NO_CONTEXT", "Nema konteksta", null))
      try {
        val source = BitmapFactory.decodeFile(Uri.parse(uriString).path)
          ?: return@AsyncFunction promise.reject(
            CodedException("DECODE_FAILED", "Fotografija se ne moze ucitati", null)
          )

        val client = SubjectSegmentation.getClient(
          SubjectSegmenterOptions.Builder()
            .enableForegroundConfidenceMask()
            .build()
        )

        client.process(InputImage.fromBitmap(source, 0))
          .addOnSuccessListener { result ->
            try {
              val mask = result.foregroundConfidenceMask
                ?: return@addOnSuccessListener promise.reject(
                  CodedException("NO_MASK", "Segmentacija nije vratila masku", null)
                )

              // 1) Zamucena kopija cijele slike (pozadina)
              val blurred = blurBitmap(context, source, 22f)
              // 2) Subjekt preko zamucene pozadine po confidence maski
              val output = composite(source, blurred, mask, source.width, source.height)

              val outFile = File.createTempFile("wagen-processed-", ".jpg", context.cacheDir)
              FileOutputStream(outFile).use { fos ->
                output.compress(Bitmap.CompressFormat.JPEG, 90, fos)
              }
              promise.resolve("file://${outFile.absolutePath}")
            } catch (e: Throwable) {
              promise.reject(CodedException("COMPOSITE_FAILED", e.message ?: "Obrada pala", e))
            }
          }
          .addOnFailureListener { e ->
            promise.reject(CodedException("SEGMENTATION_FAILED", e.message ?: "Segmentacija pala", e))
          }
      } catch (e: Throwable) {
        promise.reject(CodedException("PROCESS_FAILED", e.message ?: "Obrada pala", e))
      }
    }
  }

  private fun blurBitmap(context: android.content.Context, source: Bitmap, radius: Float): Bitmap {
    // RenderScript je deprecated ali prisutan i pouzdan na API 24+;
    // zamjena (RenderEffect) trazi API 31 - odluka za kasnije po metrikama.
    val output = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val rs = RenderScript.create(context)
    try {
      val input = Allocation.createFromBitmap(rs, source)
      val out = Allocation.createFromBitmap(rs, output)
      val script = ScriptIntrinsicBlur.create(rs, Element.U8_4(rs))
      script.setRadius(radius.coerceIn(1f, 25f))
      script.setInput(input)
      script.forEach(out)
      out.copyTo(output)
    } finally {
      rs.destroy()
    }
    return output
  }

  private fun composite(
    foreground: Bitmap,
    background: Bitmap,
    confidenceMask: java.nio.FloatBuffer,
    width: Int,
    height: Int,
  ): Bitmap {
    // Maska pouzdanosti -> alpha bitmapa subjekta
    val alphaPixels = IntArray(width * height)
    confidenceMask.rewind()
    for (i in 0 until width * height) {
      val confidence = confidenceMask.get()
      val alpha = (confidence * 255f).toInt().coerceIn(0, 255)
      alphaPixels[i] = alpha shl 24
    }
    val maskBitmap = Bitmap.createBitmap(alphaPixels, width, height, Bitmap.Config.ARGB_8888)

    // Subjekt izrezan maskom
    val subject = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val subjectCanvas = Canvas(subject)
    subjectCanvas.drawBitmap(foreground, 0f, 0f, null)
    val maskPaint = Paint().apply { xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN) }
    subjectCanvas.drawBitmap(maskBitmap, 0f, 0f, maskPaint)

    // Zamucena pozadina + subjekt preko nje
    val result = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(result)
    canvas.drawBitmap(background, 0f, 0f, null)
    canvas.drawBitmap(subject, 0f, 0f, null)
    return result
  }
}
