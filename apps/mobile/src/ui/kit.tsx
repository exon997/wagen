/**
 * AlphaOne UI kit (dizajn vlasnika 2026-09-07): svijetla tema, Exo 2,
 * disciplina tri boje (amber=akcije, green=odabrano/uspjeh + tekstualna
 * oznaka, red=okidac). Dizajnerov finalni identitet mijenja tokene,
 * komponente ostaju.
 */
import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
  type PressableProps,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { alphaone } from '@wagen/domain';

/* eslint-disable @typescript-eslint/no-require-imports -- Metro trazi require() za staticke assete */
export const FONTS = {
  'Exo2-Regular': require('../../assets/fonts/Exo2-Regular.ttf') as number,
  'Exo2-Medium': require('../../assets/fonts/Exo2-Medium.ttf') as number,
  'Exo2-SemiBold': require('../../assets/fonts/Exo2-SemiBold.ttf') as number,
  'Exo2-Bold': require('../../assets/fonts/Exo2-Bold.ttf') as number,
  'Exo2-ExtraBold': require('../../assets/fonts/Exo2-ExtraBold.ttf') as number,
  'Exo2-Italic': require('../../assets/fonts/Exo2-Italic.ttf') as number,
  'Exo2-BoldItalic': require('../../assets/fonts/Exo2-BoldItalic.ttf') as number,
};
/* eslint-enable @typescript-eslint/no-require-imports */

export type FontWeight = 'regular' | 'medium' | 'semibold' | 'bold' | 'extrabold';
const FAMILY: Record<FontWeight, string> = {
  regular: 'Exo2-Regular',
  medium: 'Exo2-Medium',
  semibold: 'Exo2-SemiBold',
  bold: 'Exo2-Bold',
  extrabold: 'Exo2-ExtraBold',
};

export function T({
  w = 'regular',
  size = 15,
  color = alphaone.ink,
  style,
  children,
  ...rest
}: {
  w?: FontWeight;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  children: ReactNode;
} & React.ComponentProps<typeof Text>) {
  return (
    <Text {...rest} style={[{ fontFamily: FAMILY[w], fontSize: size, color }, style]}>
      {children}
    </Text>
  );
}

export function Card({ style, children }: { style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View style={[kit.card, style]}>{children}</View>;
}

/** Primarni CTA: amber pilula, crni bold tekst. */
export function Cta({
  label,
  arrow = true,
  style,
  ...rest
}: { label: string; arrow?: boolean; style?: StyleProp<ViewStyle> } & PressableProps) {
  return (
    <Pressable {...rest} style={({ pressed }) => [kit.cta, pressed && { opacity: 0.85 }, style]}>
      <T w="bold" size={20}>
        {label}
      </T>
      {arrow && (
        <T w="extrabold" size={20}>
          {'  ⇥'}
        </T>
      )}
    </Pressable>
  );
}

/** Amber kruzna ikona (navigacija/akcije). */
export function IconCircle({
  glyph,
  size = 52,
  style,
  ...rest
}: { glyph: string; size?: number; style?: StyleProp<ViewStyle> } & PressableProps) {
  return (
    <Pressable
      {...rest}
      style={({ pressed }) => [
        kit.iconCircle,
        { width: size, height: size, borderRadius: size / 2 },
        pressed && { opacity: 0.85 },
        style,
      ]}
      hitSlop={10}
    >
      <T w="bold" size={size * 0.44}>
        {glyph}
      </T>
    </Pressable>
  );
}

/** Prekidac s tekstualnom oznakom stanja (daltonizam: boja NIJE jedini signal). */
export function ToggleRow({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string;
  subtitle: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <Pressable style={kit.toggleRow} onPress={() => onChange(!value)}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <T w="bold" size={17}>
          {title}
        </T>
        <T size={13} color={alphaone.muted}>
          {subtitle}
        </T>
      </View>
      <View style={{ alignItems: 'center' }}>
        <View style={[kit.track, value ? kit.trackOn : kit.trackOff]}>
          <View style={[kit.knob, value ? kit.knobOn : kit.knobOff]} />
        </View>
        <T w="semibold" size={11} color={value ? alphaone.green : alphaone.muted}>
          {value ? 'Uključeno ✓' : 'Isključeno'}
        </T>
      </View>
    </Pressable>
  );
}

export function Wordmark({ small = false }: { small?: boolean }) {
  return (
    <View>
      <T w="extrabold" size={small ? 26 : 34} color="#8a8a8a" style={{ fontStyle: 'italic' }}>
        wagen
      </T>
      <View style={{ flexDirection: 'row', alignSelf: 'flex-end', marginTop: -4 }}>
        <T w="bold" size={small ? 15 : 19}>
          Alpha
        </T>
        <T w="regular" size={small ? 15 : 19} style={{ fontStyle: 'italic' }}>
          One
        </T>
      </View>
    </View>
  );
}

export const kit = StyleSheet.create({
  screen: { flex: 1, backgroundColor: alphaone.bg },
  screenPad: { flex: 1, backgroundColor: alphaone.bg, padding: 18 },
  card: {
    backgroundColor: alphaone.card,
    borderRadius: 24,
    padding: 20,
    marginBottom: 16,
  },
  cta: {
    backgroundColor: alphaone.amber,
    borderRadius: 28,
    paddingVertical: 16,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    backgroundColor: alphaone.amber,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
  },
  track: { width: 52, height: 30, borderRadius: 15, padding: 3, justifyContent: 'center' },
  trackOn: { backgroundColor: alphaone.green },
  trackOff: { backgroundColor: '#cfcfcf' },
  knob: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#fff' },
  knobOn: { alignSelf: 'flex-end' },
  knobOff: { alignSelf: 'flex-start' },
});
