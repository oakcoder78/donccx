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
  Info,
  Check,
} from "lucide-react"

export const ActivityIcons = {

  reuniao: Calendar,

  ligacao: Phone,

  email: Mail,

  whatsapp: MessageCircle,

  tarefa: CheckSquare,

  nota: FileText,

  relatorio: FileText,

}


export const ActivityIconBackgrounds = {

  reuniao: '#E6F1FB',

  ligacao: '#FAEEDA',

  email: '#EAF3DE',

  whatsapp: '#E6F9EC',

  tarefa: '#EEEDFE',

  nota: '#F5F5F3',

  relatorio: '#E8EEF7',

}


export const DefaultActivityIcon = FileText

export const ActionIcons = {
  edit: Pencil,
  delete: Trash2,
  view: Eye,
  link: Link,
  email: Mail,
  remove: X,
  attachment: Paperclip,
  search: Search,
  user: User,
  smartphone: Smartphone,
  recalculate: RefreshCw,
  info: Info,
  calendar: Calendar,
}

export const SettingsMenuIcons = {
  'minha-conta': User,
  health:        Heart,
  catalog:       Package,
  segments:      Tag,
  stages:        RefreshCw,
  users:         Users,
  logs:          ClipboardList,
  freshdesk:     Headphones,
  donkie:        Bot,
  ai:            Sparkles,
  'donc-api':    Plug,
  features:      Flag,
}

export const HealthDimensionIcons = {
  health_uso: BarChart3,
  health_suporte: Target,
  health_relacionamento: Handshake,
  health_financeiro: Wallet,
  health_projeto: Rocket
}

export const SectionIcons = {
  capa:             FileText,
  escala:           BarChart3,
  suporte:          Target,
  projetos:         Rocket,
  health_score:     BarChart3,
  destaques:        Star,
  contexto:         Globe,
  proximos_passos:  Target,
  'custom-text':    FileText,
  'custom-image':   ImageIcon,
  'custom-metrics': BarChart3,
  'custom-bars':    BarChart3,
}

export const FallbackSectionIcon = FileText

export const PhaseIcons = {
  done:      Check,
  milestone: Flag,
  normal:    FileText,
}
