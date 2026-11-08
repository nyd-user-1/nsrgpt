'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

// lucide's `settings-2`, redrawn in animate-ui's pattern (2026-11-08), as govblock's file-text was: the same paths, so
// it is pixel-identical at rest, with one motion for when an AnimateIcon ancestor plays it. The two knobs slide along
// their rails, past each other and back.

type Settings2Props = IconProps<keyof typeof animations>;

const slide = (x: number) => ({
  initial: { x: 0 },
  animate: { x: [0, x, 0], transition: { duration: 0.6, ease: 'easeInOut' as const } },
});

const animations = {
  default: {
    rail1: {},
    rail2: {},
    knob1: slide(-6),
    knob2: slide(6),
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: Settings2Props) {
  const { controls } = useAnimateIconContext();
  const variants = getVariants(animations);

  return (
    <motion.svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <motion.path d="M14 17H5" variants={variants.rail1} initial="initial" animate={controls} />
      <motion.path d="M19 7h-9" variants={variants.rail2} initial="initial" animate={controls} />
      <motion.circle cx="17" cy="17" r="3" variants={variants.knob1} initial="initial" animate={controls} />
      <motion.circle cx="7" cy="7" r="3" variants={variants.knob2} initial="initial" animate={controls} />
    </motion.svg>
  );
}

function Settings2(props: Settings2Props) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  Settings2,
  Settings2 as Settings2Icon,
  type Settings2Props,
  type Settings2Props as Settings2IconProps,
};
