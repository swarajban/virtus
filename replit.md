# Overview

Virtus is a workout tracking web application designed for powerbuilding/strength training programs. The app allows users to track their workout progress, view exercise history with performance charts, manage 1RM (one-rep max) values, and follow structured workout programs. Built as a mobile-first Progressive Web App (PWA), it provides an intuitive interface for gym-goers to log exercises, track weights, sets, and reps, and monitor their strength progression over time. The app supports multiple workout programs and user accounts with database synchronization.

## Recent Updates (January 2025)
- **Program Cycle Tracking**: Added ability to repeat programs through multiple cycles with full history preservation
  - New "Start New Program" button in Settings to begin fresh program cycles
  - Cycle indicator displayed on home page and workout headers (e.g., "Cycle 2")
  - Automatic cycle increment when repeating same program, or cycle reset when switching programs
  - All workout progress is isolated by cycle, allowing users to compare performance across cycles
  - Backend tracks max cycle per program and calculates next cycle intelligently
- **Session ID Implementation**: Added unique session tracking (format: session_[timestamp]_[random]) to precisely identify each workout attempt
- **Fixed Reset Bug**: Reset workout now only clears data for the current session, preserving historical workout data
- **Fixed Complete Workout Bug**: Resolved issue where completing a workout was clearing all exercise progress data
- **Improved Animation**: Simplified exercise completion animation from 1s to 500ms with cleaner visual design
- **Data Integrity**: All workout and exercise data now properly preserved when changing workout status
- **Exercise Database Migration**: Created exercises table and successfully migrated 56 unique exercises from JSON to PostgreSQL database
- **Exercise Info Page**: New page for viewing/editing exercise details including YouTube videos, notes, custom 1RM values
- **Exercises List Page**: New searchable exercise directory with ability to add custom exercises
- **Enhanced Navigation**: Exercise names now link to exercise info pages throughout the app for easy access
- **Dynamic Exercise Seeding**: Replaced hard-coded exercise list with dynamic extraction from workout JSON, ensuring all exercises from workouts are automatically seeded
- **Single Source of Truth**: Consolidated workout data to use `client/public/powerbuilding_data.json` for both frontend and backend operations

# User Preferences

Preferred communication style: Simple, everyday language.

# System Architecture

## Frontend Architecture
- **Framework**: React 18 with TypeScript and Vite for fast development and building
- **Routing**: Wouter for lightweight client-side routing
- **UI Components**: Shadcn/ui component library with Radix UI primitives for accessibility
- **Styling**: Tailwind CSS with custom CSS variables for theming
- **State Management**: TanStack React Query for server state and local storage for workout progress
- **Mobile-First Design**: Responsive design optimized for mobile devices with touch-friendly interfaces

## Data Management
- **Storage Strategy**: PostgreSQL database for cross-device synchronization with username-based authentication
- **Data Schema**: Zod schemas for type-safe data validation and parsing  
- **Workout Data**: JSON file with programs structure containing multiple workout programs
- **User Management**: Username-based system with preset users ("swaraj", "demo")
- **Program Selection**: Users can switch between available workout programs through Settings
- **Program Cycle Tracking**: Each user has a currentProgramCycle field tracking their active cycle number
  - Workout progress is isolated by both userId and programCycle for historical comparison
  - Users can repeat programs indefinitely, with each cycle tracked separately
  - API endpoint `/api/start-new-program` handles cycle calculation and user updates
- **Exercise Database**: Dedicated exercises table with 56 unique exercises including metadata (notes, YouTube links, 1RM configs)
- **Exercise History**: Tracks all working sets with exercise_id foreign keys for data integrity

## Backend Architecture
- **Server**: Express.js with TypeScript for API endpoints
- **Database**: PostgreSQL with Drizzle ORM for future data persistence (currently using in-memory storage)
- **Session Management**: Connect-pg-simple for PostgreSQL session storage
- **Development**: Vite middleware integration for hot module replacement in development

## Component Architecture
- **Page Components**: Home, Workout, Exercise, OneRM, Exercise History, Settings, Exercises (list), and Exercise Info pages
- **UI Components**: Reusable components for workout cards, progress bars, weight inputs, exercise history modals, and user selector
- **Custom Hooks**: Mobile detection and toast notifications for enhanced UX
- **Chart Integration**: Chart.js for rendering exercise history graphs and progress visualization
- **Settings Page**: Centralized location for user account switching and program selection
- **Exercise Management**: Full CRUD operations for exercises with YouTube video embeds and 1RM configuration

## Workout Logic
- **1RM Integration**: Automatic weight calculation based on user's one-rep max values and exercise load percentages
- **Progress Tracking**: Three workout states (not started, in progress, completed) with timestamp tracking
- **Cycle-Based Progress**: Workout progress is scoped to the current program cycle, allowing clean restarts
- **Exercise History**: Historical data tracking with date-based performance charts
- **Weight Calculations**: Smart rounding to nearest 5lbs for practical weight plate combinations

# External Dependencies

## Core Framework Dependencies
- **React & TypeScript**: Frontend framework with type safety
- **Vite**: Build tool and development server
- **Wouter**: Lightweight routing library
- **TanStack React Query**: Server state management and caching

## UI & Styling
- **Tailwind CSS**: Utility-first CSS framework
- **Shadcn/ui**: Modern component library built on Radix UI
- **Radix UI**: Headless UI primitives for accessibility
- **Lucide React**: Icon library for consistent iconography
- **Chart.js**: Charting library for exercise progress visualization

## Database & Backend
- **PostgreSQL**: Primary database (configured but not actively used)
- **Drizzle ORM**: Type-safe database toolkit and query builder
- **@neondatabase/serverless**: Serverless PostgreSQL driver
- **Express.js**: Web application framework for Node.js

## Development Tools
- **@replit/vite-plugin-cartographer**: Replit-specific development tooling
- **@replit/vite-plugin-runtime-error-modal**: Enhanced error handling in development
- **ESBuild**: Fast JavaScript bundler for production builds

## Data Management
- **Zod**: Schema validation and type inference
- **date-fns**: Date manipulation and formatting utilities
- **LocalStorage API**: Browser storage for workout data persistence

## Utility Libraries
- **clsx & class-variance-authority**: Dynamic CSS class composition
- **cmdk**: Command palette component for enhanced navigation
- **nanoid**: Unique ID generation for data entities