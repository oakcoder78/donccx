# Activity Attachments — Step 14.3 — Global Icon Registry Integration

## Context

After stabilizing JSX behavior  
and removing invalid rendering patterns,

the icon system  
was still fragmented  
across multiple modules.

Several components  
contained duplicated  
icon mappings.

Examples included:

- local typeIcon objects  
defined inside components  

- local typeBg objects  
declared per file  

- repeated icon logic  
spread across modules  

- emoji-based icons  
used inconsistently  
throughout the interface  

This created risks such as:

- visual inconsistencies  
between modules  

- duplicated definitions  
across files  

- difficult maintenance  
during future changes  

- increased probability  
of rendering errors  

- unpredictable fallback behavior  

Initially, the icon logic  
was limited  
to activity components.

However,  
as the UI expanded  
to include:

- operational tables  
- report modules  
- dashboard dimensions  
- configuration panels  
- action buttons  

the system required  
a scalable  
and centralized  
icon management strategy.

A unified global registry  
became necessary  
to standardize behavior  
and simplify future development.

---

## Purpose

This step introduces  
a centralized  
global icon registry  
responsible for:

- defining activity icons  
in a single location  

- defining action icons  
(edit, delete, view)  

- defining health dimension icons  

- defining settings menu icons  

- defining report section icons  

- defining icon backgrounds  
centrally  

- eliminating duplicated  
icon mappings  

- replacing emoji-based icons  
with vector icons  

- improving visual consistency  
across modules  

- enabling scalable  
icon usage across the platform  

This registry  
acts as the **single source of truth**  
for all UI icons  
used throughout the system.

---

## Implementation

The global icon registry  
was created  
and progressively expanded  
to support multiple UI domains.

The implementation  
occurred in structured phases.

---

## 1 — Create Global Icon Registry

A new file  
was created:

src/lib/icons.js

This file centralizes  
all icon definitions  
used throughout the system.

The registry initially  
included activity icons  
and later expanded  
to support global UI elements.

Core icon imports:

```javascript
import {
  Calendar,
  Phone,
  Mail,
  MessageCircle,
  CheckSquare,
  FileText,
  BarChart3,
  Target,
  Handshake,
  Wallet,
  Rocket,
  Pencil,
  Trash2,
  Eye,
  Link,
  X,
  Star,
  Globe,
  Image as ImageIcon,
  Paperclip,
  Search,
  User,
  Smartphone,
  RefreshCw,
  Heart,
  Package,
  Tag,
  Users,
  ClipboardList,
  Headphones,
  Bot,
  Sparkles,
  Plug,
  Flag,
  Info
} from "lucide-react"