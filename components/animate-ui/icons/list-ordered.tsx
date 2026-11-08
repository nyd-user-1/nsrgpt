'use client';

import * as React from 'react';
import { motion, type Variants } from 'motion/react';

import {
  getVariants,
  useAnimateIconContext,
  IconWrapper,
  type IconProps,
} from '@/components/animate-ui/icons/icon';

// lucide's `list-ordered`, redrawn in animate-ui's pattern (2026-11-08), as govblock's file-text was: the same paths,
// so it is pixel-identical at rest, with one motion for when an AnimateIcon ancestor plays it. The three lines write
// themselves in, top to bottom, beside their numbers.

type ListOrderedProps = IconProps<keyof typeof animations>;

const write = (delay: number) => ({
  initial: { pathLength: 1, opacity: 1 },
  animate: { pathLength: [0, 1], opacity: [0, 1], transition: { duration: 0.35, delay, ease: 'easeInOut' as const } },
});

const animations = {
  default: {
    line1: write(0),
    line2: write(0.12),
    line3: write(0.24),
    numbers: {},
  } satisfies Record<string, Variants>,
} as const;

function IconComponent({ size, ...props }: ListOrderedProps) {
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
      <motion.path d="M10 6h11" variants={variants.line1} initial="initial" animate={controls} />
      <motion.path d="M10 12h11" variants={variants.line2} initial="initial" animate={controls} />
      <motion.path d="M10 18h11" variants={variants.line3} initial="initial" animate={controls} />
      <motion.g variants={variants.numbers} initial="initial" animate={controls}>
        <path d="M4 10h2" />
        <path d="M4 6h1v4" />
        <path d="M6 18H4c0-1 2-2 2-3s-1-1.5-2-1" />
      </motion.g>
    </motion.svg>
  );
}

function ListOrdered(props: ListOrderedProps) {
  return <IconWrapper icon={IconComponent} {...props} />;
}

export {
  animations,
  ListOrdered,
  ListOrdered as ListOrderedIcon,
  type ListOrderedProps,
  type ListOrderedProps as ListOrderedIconProps,
};
