import {
  Calendar,
  Phone,
  Mail,
  MessageCircle,
  CheckSquare,
  FileText
} from "lucide-react"


import {
  BarChart3,
  Target,
  Handshake,
  Wallet,
  Rocket
} from "lucide-react"

import {
  Pencil,
  Trash2,
  Eye,
  Link,
  Mail,
  X
} from "lucide-react"

export const ActivityIcons = {

  reuniao: Calendar,

  ligacao: Phone,

  email: Mail,

  whatsapp: MessageCircle,

  tarefa: CheckSquare,

  nota: FileText

}


export const ActivityIconBackgrounds = {

  reuniao: '#E6F1FB',

  ligacao: '#FAEEDA',

  email: '#EAF3DE',

  whatsapp: '#E6F9EC',

  tarefa: '#EEEDFE',

  nota: '#F5F5F3'

}


export const DefaultActivityIcon = FileText

export const ActionIcons = {
  edit: Pencil,
  delete: Trash2,
  view: Eye,
  link: Link,
  email: Mail,
  remove: X
}

export const HealthDimensionIcons = {
  health_uso: BarChart3,
  health_suporte: Target,
  health_relacionamento: Handshake,
  health_financeiro: Wallet,
  health_projeto: Rocket
}
