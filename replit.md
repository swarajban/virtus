# Overview

Virtus is a workout tracking web application designed for powerbuilding/strength training programs. The app allows users to track their workout progress, view exercise history with performance charts, manage 1RM (one-rep max) values, and follow structured workout programs. Built as a mobile-first Progressive Web App (PWA), it provides an intuitive interface for gym-goers to log exercises, track weights, sets, and reps, and monitor their strength progression over time.

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
- **Storage Strategy**: Browser localStorage for workout progress, 1RM values, and exercise history
- **Data Schema**: Zod schemas for type-safe data validation and parsing
- **Workout Data**: Static JSON file containing structured workout programs with exercises, sets, reps, and load percentages
- **State Persistence**: Custom LocalStorage class for managing workout progress, 1RM data, and exercise history

## Backend Architecture
- **Server**: Express.js with TypeScript for API endpoints
- **Database**: PostgreSQL with Drizzle ORM for future data persistence (currently using in-memory storage)
- **Session Management**: Connect-pg-simple for PostgreSQL session storage
- **Development**: Vite middleware integration for hot module replacement in development

## Component Architecture
- **Page Components**: Home, Workout, Exercise, and OneRM pages for different app sections
- **UI Components**: Reusable components for workout cards, progress bars, weight inputs, and exercise history modals
- **Custom Hooks**: Mobile detection and toast notifications for enhanced UX
- **Chart Integration**: Chart.js for rendering exercise history graphs and progress visualization

## Workout Logic
- **1RM Integration**: Automatic weight calculation based on user's one-rep max values and exercise load percentages
- **Progress Tracking**: Three workout states (not started, in progress, completed) with timestamp tracking
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