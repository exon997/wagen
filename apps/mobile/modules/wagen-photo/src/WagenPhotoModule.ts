import { requireNativeModule } from 'expo';

interface WagenPhotoNative {
  isSubjectSegmentationAvailable(): Promise<boolean>;
  requestSegmentationModule(): Promise<boolean>;
  processPhoto(
    uri: string,
    options: { mode: 'none' | 'blur' | 'template'; templateUri?: string; enhance?: boolean },
  ): Promise<string>;
  blurRegions(
    uri: string,
    rects: { left: number; top: number; width: number; height: number }[],
  ): Promise<string>;
}

export default requireNativeModule<WagenPhotoNative>('WagenPhoto');
