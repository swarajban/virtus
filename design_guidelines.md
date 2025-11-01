# Virtus Powerbuilding App - Design Guidelines

## Design Approach

**System Selection**: Material Design 3 with fitness app optimizations
**Rationale**: Utility-focused workout tracking demands clarity, efficiency, and proven interaction patterns. Material Design 3 provides robust mobile components, excellent touch target standards, and systematic approach to information hierarchy—critical for in-workout usage.

**Reference Inspiration**: Strong (simplicity), Hevy (clean data presentation), Apple Fitness (focused states)

## Typography System

**Font Stack**: 
- Primary: Inter (via Google Fonts CDN) - neutral, highly legible for data
- Accent: Space Grotesk - bold numbers, timer displays

**Type Scale**:
- Hero Numbers (timer, weight values): text-5xl to text-6xl, font-bold
- Exercise Names: text-xl, font-semibold
- Set/Rep Labels: text-sm, font-medium, uppercase tracking
- Input Labels: text-xs, font-medium
- Body Text: text-base
- Metadata (rest time, last workout): text-sm, opacity-70

**Mobile Optimization**: Minimum 16px (text-base) for body, 44px minimum touch targets

## Layout System

**Spacing Primitives**: Use Tailwind units of 2, 4, 6, and 8 for consistency
- Micro spacing (within components): space-y-2, gap-2
- Component padding: p-4, p-6
- Section spacing: space-y-6, space-y-8
- Screen margins: px-4 (mobile), px-6 (tablet)

**Grid Structure**:
- Single column primary content flow
- 2-column grid for set/rep input pairs (grid-cols-2 gap-4)
- Inset cards for exercise blocks (not full-width - use mx-4 for breathing room)

## Core Component Library

### Exercise Page Layout
**Container**: max-w-lg mx-auto px-4 py-6

**Exercise Header Block**:
- Exercise name: text-xl font-semibold mb-2
- Target sets/reps metadata: text-sm opacity-70
- Equipment/notes: text-sm, collapsible accordion

**Sets Tracking Table**:
- Grid layout: 4 columns (Set # | Weight | Reps | Checkbox)
- Row height: min-h-14 for comfortable touch
- Previous set data: ghost row above inputs showing last workout
- Input fields: Rounded-lg, h-12, text-center, font-semibold text-lg
- Completed checkboxes: w-8 h-8, rounded-full

**Rest Timer Component** (Inline Position):
- Placement: Between last set row and "Complete Exercise" button
- Card treatment: Distinct container with rounded-2xl, p-6
- Timer display: text-6xl font-bold, tabular-nums, centered
- Control buttons: Horizontal flex layout, gap-3
  - Play/Pause: w-16 h-16, rounded-full, primary icon
  - Reset: w-12 h-12, rounded-full, secondary
  - Add 30s: text button, h-12
- Progress ring: Circular progress indicator wrapping timer
- Visual weight: Should feel like a focused "state" not just a widget

**Complete Exercise Button**:
- Full width: w-full
- Height: h-14
- Position: mb-8 (breathing room from bottom)
- Type: Primary CTA styling
- Text: text-base font-semibold

### Navigation & Structure
**Top App Bar**:
- Sticky position: sticky top-0
- Height: h-16
- Content: Back arrow, workout name, overflow menu
- Blur backdrop treatment

**Bottom Navigation** (Main app navigation):
- Fixed bottom-0, h-16
- 4 items: Workout | History | Programs | Profile
- Icon + label format, text-xs labels

### Input Components
**Number Inputs** (Weight/Reps):
- Stepper-style with +/- buttons flanking value
- Central display: w-20 h-12, text-lg font-semibold
- Side buttons: w-10 h-12, subtle borders
- Haptic feedback on interaction (note in spec)

**Action Buttons**:
- Primary: h-12 to h-14, rounded-lg, font-semibold
- Secondary: h-10 to h-12, outlined variant
- Icon buttons: w-10 h-10 to w-12 h-12, rounded-full
- Minimum touch target enforcement: 44x44px

### Data Display Cards
**Workout Summary Card**:
- Rounded-xl, p-6
- Grid-cols-3 for stats (Volume | Sets | Duration)
- Large numbers: text-2xl font-bold
- Labels: text-xs uppercase tracking-wide

**Exercise History Item**:
- Rounded-lg, p-4
- Flex layout: Exercise name | Best set | Chevron
- Tap target: min-h-16

## Animations (Minimal)

**Timer State Changes**:
- Number tick: Smooth counting transition, no elaborate effects
- Rest complete: Single subtle pulse + haptic

**Interaction Feedback**:
- Button press: Scale down transform-95, duration-100
- Set completion: Checkmark fade-in, duration-200
- No scroll-triggered animations
- No loading skeletons (instant data rendering)

## Icons

**Library**: Heroicons (via CDN)
**Usage**:
- Navigation: 24px stroke icons
- Inline actions: 20px icons
- Input steppers: 16px plus/minus
- Consistent 2px stroke width

## Accessibility Standards

**Touch Targets**: Minimum 44x44px for all interactive elements
**Focus States**: 2px outline offset, visible keyboard navigation
**Form Labels**: Associated with inputs, sr-only class where visual label exists
**ARIA**: Live region for timer countdown, role="timer"
**Contrast**: Maintain WCAG AA on all text (even with dark theme constraint)

## Images

**App Interface**: No hero images required - this is a utility app
**Exercise Demonstrations**: 
- Square thumbnails (1:1 ratio) in exercise library
- Size: 80x80px mobile, 120x120px tablet
- Placement: Left of exercise name in selection lists
- Treatment: Rounded-lg, subtle border

**Empty States**:
- Illustration placeholders for no workouts/exercises
- Simple line art style, centered, max-w-xs
- Placement: Center of viewport with helper text below

## Mobile-First PWA Specifications

**Viewport**: Width device-width, initial-scale=1, user-scalable=no (workout mode)
**Safe Areas**: Respect top/bottom insets (iOS notch, gesture bars)
**Offline State**: Inline banner at top when offline, h-8, subtle treatment
**Install Prompt**: Bottom sheet modal, rounded-t-2xl, p-6, appears once

**Gesture Zones**:
- Swipe right: Back navigation (exercise page)
- Pull down: Refresh workout data
- No horizontal carousels (single-column focus)

This creates a focused, efficient workout tracking experience optimized for one-handed mobile use during training sessions.