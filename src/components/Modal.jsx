import React from 'react'
import { X } from 'lucide-react'

export default function Modal({ title, subtitle, onClose, children }) { return <div className="modal-backdrop" onMouseDown={onClose}><div className="modal" onMouseDown={event => event.stopPropagation()}><div className="modal-head"><div><p className="eyebrow">NIRMANAM WORKSPACE</p><h2>{title}</h2><p>{subtitle}</p></div><button className="close-button" onClick={onClose}><X size={20} /></button></div>{children}</div></div> }
