import ExpoModulesCore

// I3: Vision subject lift dolazi ovdje kad Apple Developer racun proradi.
// Do tada iOS javlja da puni pipeline nije dostupan (degradacija u JS sloju).
public class WagenPhotoModule: Module {
  public func definition() -> ModuleDefinition {
    Name("WagenPhoto")

    AsyncFunction("isSubjectSegmentationAvailable") { () -> Bool in
      return false
    }

    AsyncFunction("requestSegmentationModule") { () -> Bool in
      return false
    }

    AsyncFunction("processPhoto") { (uri: String) throws -> String in
      throw NSError(domain: "WagenPhoto", code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "iOS obrada stize u I3"])
    }
  }
}
