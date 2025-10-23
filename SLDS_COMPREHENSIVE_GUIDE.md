# Salesforce Lightning Design System (SLDS) 2.0 - Comprehensive Guide

## Overview
This document provides a comprehensive understanding of SLDS 2.0 customization, components, and implementation patterns based on the VS Code Extension's SLDS implementation.

## Table of Contents
1. [SLDS Core Concepts](#slds-core-concepts)
2. [Styling Hooks System](#styling-hooks-system)
3. [Design Tokens](#design-tokens)
4. [Components Library](#components-library)
5. [Utilities Classes](#utilities-classes)
6. [NPM Tools for SLDS Compliance](#npm-tools-for-slds-compliance)
7. [Implementation in VS Code Extension](#implementation-in-vs-code-extension)

---

## SLDS Core Concepts

### What is SLDS?
Salesforce Lightning Design System (SLDS) is a CSS framework that provides a look and feel consistent with Salesforce Lightning Experience. It includes:
- Pre-built components
- Design tokens for theming
- Utility classes for rapid development
- Accessibility features built-in

### Key Principles
- **Mobile-first responsive design**
- **Accessibility (WCAG 2.0 AA compliant)**
- **Component-based architecture**
- **Consistent with Salesforce UI**

---

## Styling Hooks System

### Overview
Styling hooks act as a universal design system vocabulary that bridges the gap between designers and developers. They provide a flexible, scalable way to customize SLDS components globally.

### Key Concepts

#### 1. **Purpose of Styling Hooks**
- **Alignment**: Common vocabulary between designers and developers
- **Flexibility**: Global style updates without component-level changes
- **Collaboration**: Teams can evolve styling hooks for new themes

#### 2. **Types of Styling Hooks**

##### Global Styling Hooks
- Control overall application appearance
- Examples: `--slds-primary-color`, `--slds-alignment`
- Apply to all components using the hook

##### Component-Specific Hooks
- Target specific component styling
- Override global hooks for component-level customization

### Documentation Links
- **Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/319e5f-styling-hooks
- **Basics of using Styling Hooks**: https://www.lightningdesignsystem.com/2e1ef8501/p/319e5f-styling-hooks/b/775dc9
- **Transitioning to SLDS Styling Hooks**: https://www.lightningdesignsystem.com/2e1ef8501/p/319e5f-styling-hooks/b/850f4e
- **Global Styling Hooks**: https://www.lightningdesignsystem.com/2e1ef8501/p/591960-global-styling-hooks
- **Styling Hook for Global**: https://www.lightningdesignsystem.com/2e1ef8501/p/591960-global-styling-hooks/b/768d36

---

## Design Tokens

### Color System

#### Understanding SLDS Color
- **System Palette**: Core colors used throughout the design system
- **Color Palette**: Extended colors for various use cases
- **Semantic Colors**: Colors with specific meanings (success, error, warning)

#### Resources
- **Color Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/655b28-color
- **Understanding SLDS Color**: https://www.lightningdesignsystem.com/2e1ef8501/p/655b28-color/b/25b51f
- **System Palette**: https://www.lightningdesignsystem.com/2e1ef8501/p/655b28-color/b/129096
- **Color Palette**: https://www.lightningdesignsystem.com/2e1ef8501/p/655b28-color/b/04fb5f
- **Styling Hooks and How to Use**: https://www.lightningdesignsystem.com/2e1ef8501/p/655b28-color/b/00bcca

### Typography

#### Text System
- **Font families**: Salesforce Sans
- **Type scales**: Consistent sizing hierarchy
- **Line heights**: Optimized for readability

#### Resources
- **Typography for SLDS**: https://www.lightningdesignsystem.com/2e1ef8501/p/93288f-typography
- **Text Styles**: https://www.lightningdesignsystem.com/2e1ef8501/p/93288f-typography/b/995dcd
- **Typography Styling Hook**: https://www.lightningdesignsystem.com/2e1ef8501/p/93288f-typography/b/48e09b

### Spacing & Sizing

#### Spacing System
- Consistent spacing scale
- Margin and padding utilities
- Grid-based layout system

#### Resources
- **Spacing and Sizing**: https://www.lightningdesignsystem.com/2e1ef8501/p/03d6b0-spacing-and-sizing
- **Spacing**: https://www.lightningdesignsystem.com/2e1ef8501/p/03d6b0-spacing-and-sizing/b/8315b7
- **Sizing**: https://www.lightningdesignsystem.com/2e1ef8501/p/03d6b0-spacing-and-sizing/b/25a2cc
- **Styling Hook**: https://www.lightningdesignsystem.com/2e1ef8501/p/03d6b0-spacing-and-sizing/b/23908e

### Visual Properties

#### Border Radius
- **Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/7770b4-borders-and-radius
- **How to Use**: https://www.lightningdesignsystem.com/2e1ef8501/p/7770b4-borders-and-radius/b/111c1f

#### Shadows
- **Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/64b580-shadows/b/1948b3
- **Usage**: https://www.lightningdesignsystem.com/2e1ef8501/p/64b580-shadows/b/404e68
- **Styling Hook**: https://www.lightningdesignsystem.com/2e1ef8501/p/64b580-shadows/b/181008

---

## Icons System

### Icon Categories

#### 1. **Utility Icons**
- Small, functional icons for UI actions
- Link: https://www.lightningdesignsystem.com/2e1ef8501/p/83309d-icons/b/875c85

#### 2. **Object Icons**
- Represent Salesforce objects (Account, Contact, etc.)
- Link: https://www.lightningdesignsystem.com/2e1ef8501/p/83309d-icons/b/51fcff

#### 3. **Action Icons**
- Icons for user actions (edit, delete, save)
- Link: https://www.lightningdesignsystem.com/2e1ef8501/p/83309d-icons/b/74a6f0

#### 4. **DocType Icons**
- File type representations
- Link: https://www.lightningdesignsystem.com/2e1ef8501/p/83309d-icons/b/09f294

### Local Icon Storage
Icons are stored locally at: `C:\ExtensionBuilds\salesforce-lightning-design-system-icons`

### Main Documentation
- **Icons Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/83309d-icons

---

## Components Library

### Overview
- **Components Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/755aff-components/b/1930c8

### Core Components

#### Layout Components
1. **Accordion**: https://www.lightningdesignsystem.com/2e1ef8501/p/8488c4-accordion/b/0577f6
2. **Cards**: https://www.lightningdesignsystem.com/2e1ef8501/p/33cd77-cards/b/39205c
3. **Carousel**: https://www.lightningdesignsystem.com/2e1ef8501/p/99642e-carousel
4. **Modal**: https://www.lightningdesignsystem.com/2e1ef8501/p/01c12a-modals
5. **Tabs**: https://www.lightningdesignsystem.com/2e1ef8501/p/1152cf-tabs
6. **Scoped Tabs**: https://www.lightningdesignsystem.com/2e1ef8501/p/318c20-scoped-tabs

#### Form Components
1. **Checkbox**: https://www.lightningdesignsystem.com/2e1ef8501/p/980561-checkbox/b/39205c
2. **Checkbox Button**: https://www.lightningdesignsystem.com/2e1ef8501/p/70ca9d-checkbox-button/b/39205c
3. **Combobox**: https://www.lightningdesignsystem.com/2e1ef8501/p/31c42a-combobox/b/39205c
4. **Radio Group**: https://www.lightningdesignsystem.com/2e1ef8501/p/19c76a-radio-group
5. **Radio Button Group**: https://www.lightningdesignsystem.com/2e1ef8501/p/2052d7-radio-button-group
6. **Select**: https://www.lightningdesignsystem.com/2e1ef8501/p/60fa86-select
7. **Form Element**: https://www.lightningdesignsystem.com/2e1ef8501/p/96252b-form-element/b/94306d
8. **File Selector**: https://www.lightningdesignsystem.com/2e1ef8501/p/77d584-file-selector

#### Navigation Components
1. **Breadcrumbs**: https://www.lightningdesignsystem.com/2e1ef8501/p/13cc12-breadcrumbs
2. **Vertical Navigation**: https://www.lightningdesignsystem.com/2e1ef8501/p/60977d-vertical-navigation

#### Button Components
1. **Buttons**: https://www.lightningdesignsystem.com/2e1ef8501/p/7733f8-buttons/b/39205c
2. **Button Groups**: https://www.lightningdesignsystem.com/2e1ef8501/p/30363d-button-groups
3. **Button Icons**: https://www.lightningdesignsystem.com/2e1ef8501/p/769b52-button-icons

#### Data Display Components
1. **Datatable**: https://www.lightningdesignsystem.com/2e1ef8501/p/86f13a-data-table/b/39205c
2. **Tree**: https://www.lightningdesignsystem.com/2e1ef8501/p/950b57-tree
3. **Tree Grid**: https://www.lightningdesignsystem.com/2e1ef8501/p/1234e1-tree-grid
4. **Tiles** (Important): https://www.lightningdesignsystem.com/2e1ef8501/p/87b648-tiles

#### Feedback Components
1. **Toast**: https://www.lightningdesignsystem.com/2e1ef8501/p/216f79-toast
2. **Progress Bar**: https://www.lightningdesignsystem.com/2e1ef8501/p/70ad36-progress-bar/b/9986f1
3. **Spinners**: https://www.lightningdesignsystem.com/2e1ef8501/p/959d6d-spinners
4. **Badges**: https://www.lightningdesignsystem.com/2e1ef8501/p/78871c-badges/b/39205c

#### Advanced Components
1. **Dynamic Icons** (Important): https://www.lightningdesignsystem.com/2e1ef8501/p/26424b-dynamic-icons
2. **Dueling Picklist**: https://www.lightningdesignsystem.com/2e1ef8501/p/763763-dueling-picklist/b/39205c

#### Visual Components
1. **Illustrations**: https://www.lightningdesignsystem.com/2e1ef8501/p/759a28-illustrations
2. **Illustration Types**: https://www.lightningdesignsystem.com/2e1ef8501/p/759a28-illustrations/b/74b610
3. **UI Text for Illustrations**: https://www.lightningdesignsystem.com/2e1ef8501/p/759a28-illustrations/b/76a7c3

---

## Utilities Classes

### Layout Utilities

#### Alignment
- **Documentation**: https://www.lightningdesignsystem.com/2e1ef8501/p/670c3f-alignment/b/0742d9
- Classes for text and element alignment

#### Grid Layout
- **Grid Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/61d07d-grid/b/788fe9
- **Grid CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/61d07d-grid/b/85154d
- Responsive grid system

#### Layout
- **Layout Overview**: https://www.lightningdesignsystem.com/2e1ef8501/p/711aca-layout/b/788fe9
- **Layout CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/711aca-layout/b/85154d

#### Float
- **Float**: https://www.lightningdesignsystem.com/2e1ef8501/p/340325-float/b/69a00c

#### Position
- **Position**: https://www.lightningdesignsystem.com/2e1ef8501/p/95944e-position
- **Position CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/95944e-position/b/85154d

### Spacing Utilities

#### Margin
- **Margin**: https://www.lightningdesignsystem.com/2e1ef8501/p/51dd56-margin
- **Margin CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/51dd56-margin/b/85154d

#### Padding
- **Padding**: https://www.lightningdesignsystem.com/2e1ef8501/p/93a8e1-padding
- **Padding CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/93a8e1-padding/b/8818d9

### Visual Utilities

#### Border
- **Border**: https://www.lightningdesignsystem.com/2e1ef8501/p/75f0aa-border/b/4373cb

#### Box
- **Box**: https://www.lightningdesignsystem.com/2e1ef8501/p/674e1b-box/b/05e89c

#### Visibility
- **Visibility**: https://www.lightningdesignsystem.com/2e1ef8501/p/7671f9-visibility/b/788fe9
- **Visibility CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/7671f9-visibility/b/85154d

### Content Utilities

#### Text
- **Text**: https://www.lightningdesignsystem.com/2e1ef8501/p/61daff-text/b/788fe9
- **Text CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/61daff-text/b/85154d

#### Truncation
- **Truncation**: https://www.lightningdesignsystem.com/2e1ef8501/p/51c13d-truncation/b/788fe9
- **Truncation CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/51c13d-truncation/b/85154d

#### Line Clamp
- **Line Clamp**: https://www.lightningdesignsystem.com/2e1ef8501/p/39c0a2-line-clamp/b/788fe9

#### Hyphenation
- **Hyphenation**: https://www.lightningdesignsystem.com/2e1ef8501/p/28a4d2-hyphenation/b/788fe9

### List Utilities

#### Horizontal List
- **Horizontal List**: https://www.lightningdesignsystem.com/2e1ef8501/p/24ab86-horizontal-list/b/788fe9
- **CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/24ab86-horizontal-list/b/85154d

#### Vertical List
- **Vertical List**: https://www.lightningdesignsystem.com/2e1ef8501/p/2131a9-vertical-list

#### Description List
- **Description List**: https://www.lightningdesignsystem.com/2e1ef8501/p/62faac-description-list/b/845599

#### Name/Value List
- **Name/Value List**: https://www.lightningdesignsystem.com/2e1ef8501/p/253f7e-name-value-list/b/788fe9
- **CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/253f7e-name-value-list/b/85154d

### Interactive Utilities

#### Interactions
- **Interactions**: https://www.lightningdesignsystem.com/2e1ef8501/p/91e7b1-interactions
- **CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/91e7b1-interactions/b/85154d

#### Scrollable
- **Scrollable**: https://www.lightningdesignsystem.com/2e1ef8501/p/746954-scrollable/b/788fe9
- **CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/746954-scrollable/b/85154d

### Sizing Utilities
- **Sizing**: https://www.lightningdesignsystem.com/2e1ef8501/p/927990-sizing/b/788fe9
- **Sizing CSS**: https://www.lightningdesignsystem.com/2e1ef8501/p/927990-sizing/b/85154d

### Media Object
- **Media Object**: https://www.lightningdesignsystem.com/2e1ef8501/p/87b07a-media-object

---

## NPM Tools for SLDS Compliance

### 1. SLDS Linter
- **Purpose**: Checks code for SLDS compliance issues
- **Status**: Beta (🚧)
- **Documentation**: https://www.lightningdesignsystem.com/2e1ef8501/p/012d73-slds-linter
- **Usage**: Validates HTML/CSS against SLDS best practices
- **Integration**: Can be integrated into build pipelines

### 2. SLDS Validator
- **Purpose**: Validates SLDS markup and component usage
- **Documentation**: https://www.lightningdesignsystem.com/2e1ef8501/p/952cae-slds-validator
- **Usage**: Ensures proper SLDS component structure
- **Features**: Component validation, accessibility checks

### 3. SLDS Scope Customizer
- **Purpose**: Scopes SLDS CSS to prevent conflicts
- **Documentation**: https://www.lightningdesignsystem.com/2e1ef8501/p/014cb2-slds-scope-customizer
- **Usage**: Isolates SLDS styles in mixed environments
- **Benefits**: Prevents CSS leakage between SLDS and non-SLDS components

---

## Implementation in VS Code Extension

### Current Implementation

#### 1. **File Structure**
```
runtime/
├── apps/
│   └── data-comparison/
│       └── components/
│           ├── configGenerator/
│           │   ├── improved-index.html (SLDS 2.0 compliant)
│           │   ├── slds-fixes.css
│           │   └── slds2-compliant-index.html
│           └── comparisonViewer/
│               ├── slds-index.html
│               └── slds-index.css
└── shared/
    └── assets/
        └── slds/
            └── styles/
                └── salesforce-lightning-design-system.min.css
```

#### 2. **Component Structure Pattern**
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <link rel="stylesheet" href="/shared/assets/slds/styles/salesforce-lightning-design-system.min.css">
</head>
<body>
    <div class="slds-scope">
        <!-- SLDS components here -->
    </div>
</body>
</html>
```

#### 3. **Common SLDS Classes Used**

##### Page Structure
- `slds-scope` - Root wrapper for SLDS styling
- `slds-page-header` - Page header component
- `slds-page-header__row` - Header row layout
- `slds-page-header__col-title` - Title column

##### Path Component (Wizard Steps)
- `slds-path` - Path component wrapper
- `slds-path__track` - Track container
- `slds-path__nav` - Navigation list
- `slds-path__item` - Individual step
- `slds-is-current` - Current step
- `slds-is-active` - Active step
- `slds-is-complete` - Completed step

##### Icons
- `slds-icon_container` - Icon container
- `slds-icon-standard-*` - Standard icon categories
- `slds-icon` - Icon element

##### Typography
- `slds-text-heading_large` - Large heading
- `slds-truncate` - Text truncation

##### Grid System
- `slds-grid` - Grid container
- `slds-col` - Grid column
- `slds-size_*-of-*` - Column sizing

### Best Practices

#### 1. **Always Use slds-scope**
Wrap all SLDS components in a `<div class="slds-scope">` to ensure proper styling isolation.

#### 2. **Icon Usage**
```html
<svg class="slds-icon slds-icon_small" aria-hidden="true">
    <use xlink:href="/shared/assets/slds/icons/utility-sprite/svg/symbols.svg#check"></use>
</svg>
```

#### 3. **Responsive Design**
Use SLDS grid system with responsive modifiers:
- `slds-size_1-of-1` (mobile)
- `slds-medium-size_1-of-2` (tablet)
- `slds-large-size_1-of-3` (desktop)

#### 4. **Accessibility**
- Use proper ARIA attributes
- Maintain keyboard navigation
- Include screen reader text where needed

#### 5. **Component States**
Utilize SLDS state classes:
- `slds-is-active`
- `slds-is-selected`
- `slds-has-error`
- `slds-is-disabled`

### Custom Styling Approach

#### 1. **Using Styling Hooks**
```css
.slds-scope {
    --slds-c-button-brand-color-background: #0070d2;
    --slds-c-button-brand-color-border: #0070d2;
}
```

#### 2. **Override with Specificity**
```css
.slds-scope .custom-component .slds-button {
    /* Custom styles */
}
```

#### 3. **slds-fixes.css Pattern**
Create fix files for component-specific adjustments while maintaining SLDS compliance.

---

## Migration and Updates

### Transitioning to SLDS 2.0
1. Update styling hooks from legacy custom properties
2. Replace deprecated components
3. Update icon paths to new structure
4. Test with SLDS Linter and Validator

### Version Compatibility
- SLDS 2.0 includes breaking changes from 1.x
- Use scope customizer for mixed version environments
- Test thoroughly in target Salesforce org versions

---

## Resources and References

### Official Documentation
- Main SLDS Site: https://www.lightningdesignsystem.com
- GitHub Repository: https://github.com/salesforce-ux/design-system
- Release Notes: Check versioned documentation

### Development Tools
- SLDS Linter NPM Package
- SLDS Validator NPM Package
- SLDS Scope Customizer NPM Package
- VS Code SLDS Extensions

### Community Resources
- Salesforce Stack Exchange
- SLDS Trailhead Modules
- Developer Forums

---

## Conclusion

SLDS 2.0 provides a comprehensive design system for building Salesforce-consistent UIs. The VS Code extension successfully implements SLDS patterns for its data comparison tool, demonstrating proper component usage, styling hooks, and responsive design principles. The three NPM tools (Linter, Validator, Scope Customizer) ensure code quality and prevent CSS conflicts in production environments.

Key takeaways:
1. Always scope SLDS with `slds-scope` class
2. Use styling hooks for customization
3. Follow component patterns from official documentation
4. Validate with NPM tools during development
5. Test across different Salesforce org versions