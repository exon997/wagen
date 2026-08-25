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
    // I4: zamucivanje zadanih regija (registarske tablice) - radi na SVIM
    // uredjajima (ne trazi segmentaciju). rects: lista {left,top,width,height}
    // u pikselima izvorne slike.
    AsyncFunction("blurRegions") { uriString: String, rects: List<Map<String, Double>>, promise: Promise ->
      val context = appContext.reactContext
        ?: return@AsyncFunction promise.reject(CodedException("NO_CONTEXT", "Nema konteksta", null))
      try {
        val source = BitmapFactory.decodeFile(Uri.parse(uriString).path)
          ?: return@AsyncFunction promise.reject(
            CodedException("DECODE_FAILED", "Fotografija se ne moze ucitati", null)
          )
        val mutable = source.copy(Bitmap.Config.ARGB_8888, true)
        val canvas = Canvas(mutable)
        for (rect in rects) {
          val left = (rect["left"] ?: 0.0).toInt().coerceIn(0, source.width - 1)
          val top = (rect["top"] ?: 0.0).toInt().coerceIn(0, source.height - 1)
          val w = (rect["width"] ?: 0.0).toInt().coerceAtMost(source.width - left)
          val h = (rect["height"] ?: 0.0).toInt().coerceAtMost(source.height - top)
          if (w <= 4 || h <= 4) continue
          // margina oko tablice da blur pokrije rub
          val pad = (h * 0.25).toInt()
          val cl = (left - pad).coerceAtLeast(0)
          val ct = (top - pad).coerceAtLeast(0)
          val cw = (w + 2 * pad).coerceAtMost(source.width - cl)
          val ch = (h + 2 * pad).coerceAtMost(source.height - ct)
          val region = Bitmap.createBitmap(mutable, cl, ct, cw, ch)
          val blurredRegion = blurBitmap(context, region, 25f)
          // dvostruki prolaz za jaci efekt na malim regijama
          val doubleBlurred = blurBitmap(context, blurredRegion, 25f)
          canvas.drawBitmap(doubleBlurred, cl.toFloat(), ct.toFloat(), null)
        }
        val outFile = File.createTempFile("wagen-plates-", ".jpg", context.cacheDir)
        FileOutputStream(outFile).use { fos ->
          mutable.compress(Bitmap.CompressFormat.JPEG, 90, fos)
        }
        promise.resolve("file://${outFile.absolutePath}")
      } catch (e: Throwable) {
        promise.reject(CodedException("BLUR_REGIONS_FAILED", e.message ?: "Blur pao", e))
      }
    }

    AsyncFunction("processPhoto") { uriString: String, options: Map<String, Any?>, promise: Promise ->
      val context = appContext.reactContext
        ?: return@AsyncFunction promise.reject(CodedException("NO_CONTEXT", "Nema konteksta", null))
      try {
        val source = BitmapFactory.decodeFile(Uri.parse(uriString).path)
          ?: return@AsyncFunction promise.reject(
            CodedException("DECODE_FAILED", "Fotografija se ne moze ucitati", null)
          )

        val mode = options["mode"] as? String ?: "blur"
        val templatePath = options["templateUri"] as? String
        val enhance = options["enhance"] as? Boolean ?: false

        // mode 'none': bez pozadinske obrade - samo (opcionalna) dorada
        if (mode == "none") {
          val output = if (enhance) enhanceBitmap(source) else source
          val outFile = File.createTempFile("wagen-processed-", ".jpg", context.cacheDir)
          FileOutputStream(outFile).use { fos -> output.compress(Bitmap.CompressFormat.JPEG, 90, fos) }
          promise.resolve("file://" + outFile.absolutePath)
          return@AsyncFunction
        }

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

              // Pozadina: predlozak (studio) ili zamucena kopija originala
              val background = if (mode == "template" && templatePath != null) {
                loadTemplateScaled(templatePath, source.width, source.height)
                  ?: blurBitmap(context, source, 22f)
              } else {
                blurBitmap(context, source, 22f)
              }
              var output = composite(source, background, mask, source.width, source.height)
              if (enhance) output = enhanceBitmap(output)

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

  // Predlozak skaliran i centralno obrezan na dimenzije fotke.
  // Android release pakira bundlane assete kao asset:/ ili content:/ URI -
  // decodeFile cita samo file putanje, pa idemo preko streama po shemi.
  private fun loadTemplateScaled(path: String, w: Int, h: Int): Bitmap? {
    val raw = decodeAnyUri(path) ?: return null
    val scale = maxOf(w.toFloat() / raw.width, h.toFloat() / raw.height)
    val sw = (raw.width * scale).toInt()
    val sh = (raw.height * scale).toInt()
    val scaled = Bitmap.createScaledBitmap(raw, sw, sh, true)
    val x = (sw - w) / 2
    val y = (sh - h) / 2
    return Bitmap.createBitmap(scaled, x.coerceAtLeast(0), y.coerceAtLeast(0), w, h)
  }

  private fun decodeAnyUri(path: String): Bitmap? {
    return try {
      val uri = Uri.parse(path)
      when (uri.scheme) {
        null, "file" -> BitmapFactory.decodeFile(uri.path ?: path)
        "asset" -> appContext.reactContext?.assets?.open((uri.path ?: "").removePrefix("/"))
          ?.use { BitmapFactory.decodeStream(it) }
        else -> appContext.reactContext?.contentResolver?.openInputStream(uri)
          ?.use { BitmapFactory.decodeStream(it) }
      }
    } catch (e: Throwable) {
      null
    }
  }

  // Automatska dorada: blagi kontrast + zasicenje (ColorMatrix)
  private fun enhanceBitmap(source: Bitmap): Bitmap {
    val output = Bitmap.createBitmap(source.width, source.height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(output)
    val saturation = android.graphics.ColorMatrix().apply { setSaturation(1.12f) }
    val contrast = 1.06f
    val offset = -8f
    val contrastMatrix = android.graphics.ColorMatrix(
      floatArrayOf(
        contrast, 0f, 0f, 0f, offset,
        0f, contrast, 0f, 0f, offset,
        0f, 0f, contrast, 0f, offset,
        0f, 0f, 0f, 1f, 0f,
      )
    )
    saturation.postConcat(contrastMatrix)
    val paint = Paint().apply { colorFilter = android.graphics.ColorMatrixColorFilter(saturation) }
    canvas.drawBitmap(source, 0f, 0f, paint)
    return output
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
