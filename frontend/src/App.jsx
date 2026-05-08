import { useState, useEffect, useRef } from 'react'
import './App.css'

const LOADING_PHRASES = [
  'decoding sessions',
  'reading between the prompts',
  'mapping your queries',
  'tracing motivations',
  'untangling intent',
  'extracting signals',
  'synthesizing insights',
  'gathering connections',
  'uncovering tensions',
  'identifying patterns',
  'asking why',
  'finding root causes',
  'connecting the dots',
  'sense-making over data',
  'drawing inferences',
  'puzzling over evidence',
  'consternating over complexity'
]

function stripTranscriptLine(line) {
  let entry
  try {
    entry = JSON.parse(line)
  } catch {
    return null
  }
  const t = entry.type
  if (t !== 'user' && t !== 'assistant') return null
  const message = entry.message
  if (!message || typeof message !== 'object') return null

  const textParts = []
  const content = message.content
  if (typeof content === 'string') {
    if (content.trim()) textParts.push(content)
  } else if (Array.isArray(content)) {
    for (const c of content) {
      if (
        c &&
        typeof c === 'object' &&
        c.type === 'text' &&
        typeof c.text === 'string' &&
        c.text.trim()
      ) {
        textParts.push(c.text)
      }
    }
  }
  if (!textParts.length) return null

  return {
    type: t,
    timestamp: entry.timestamp,
    message: {
      role: message.role,
      content: textParts.map((text) => ({ type: 'text', text })),
    },
  }
}

async function stripTranscriptFile(file) {
  const reader = file
    .stream()
    .pipeThrough(new TextDecoderStream())
    .getReader()

  const out = []
  let buffer = ''

  const consumeLine = (raw) => {
    const line = raw.trim()
    if (!line) return
    const stripped = stripTranscriptLine(line)
    if (stripped) out.push(JSON.stringify(stripped))
  }

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += value
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      consumeLine(buffer.slice(0, nl))
      buffer = buffer.slice(nl + 1)
    }
  }
  consumeLine(buffer)

  if (!out.length) return null
  return new Blob([out.join('\n')], { type: 'application/jsonl' })
}

function Hero({ onTryItOut }) {
  const [loadingPhrase, setLoadingPhrase] = useState(() =>
    LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)],
  )

  useEffect(() => {
    const id = setInterval(() => {
      setLoadingPhrase((prev) => {
        if (LOADING_PHRASES.length <= 1) return prev
        let next = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]
        while (next === prev) {
          next = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)]
        }
        return next
      })
    }, 10000)
    return () => clearInterval(id)
  }, [])

  return (
    <section className="hero">
      <div className="hero-eyebrow">
        <span className="hero-dot" />
        <span className="mono">{loadingPhrase}</span>
      </div>
      <h1 className="hero-title mono">
        Claude <span className="hero-title-accent"><span className="hero-title-underline">De</span>code</span>
      </h1>
      <p className="hero-tagline">
        Get deeper insights into your behavioral patterns when using Claude Code.
      </p>
      <p className="hero-description">
        Claude Decode reads your local Claude Code logs, analyzes behavioral patterns, and draws inferences about underlying motivations and frustrations.
      </p>
      <button className="cta-primary" onClick={onTryItOut}>
        Try it out
        <span className="cta-arrow">→</span>
      </button>
    </section>
  )
}

function FeatureGrid() {
  const features = [
    {
      label: 'Patterns',
      title: 'Behavioral patterns',
      body: 'See the moves you make on repeat — the way you frame problems, the kinds of fixes you ask for, the loops you fall into.',
    },
    {
      label: 'Motivations',
      title: 'Underlying motivations',
      body: 'Surface the why behind your prompts: what you optimize for, what you protect against, what you keep coming back to.',
    },
    {
      label: 'Privacy',
      title: 'Stays on your machine',
      body: 'Your transcripts go from your browser to your local server, then to Anthropic via your own API key. Nothing else.',
    },
  ]
  return (
    <section className="features">
      {features.map((f) => (
        <div key={f.label} className="feature-card">
          <div className="feature-label mono">{f.label}</div>
          <div className="feature-title">{f.title}</div>
          <div className="feature-body">{f.body}</div>
        </div>
      ))}
    </section>
  )
}

function Modal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close" onClick={onClose} aria-label="Close">
          ×
        </button>
        {children}
      </div>
    </div>
  )
}

function InsightForm({ onSubmit }) {
  const [files, setFiles] = useState([])
  const [name, setName] = useState('User')
  const [apiKey, setApiKey] = useState('')
  const [showKey, setShowKey] = useState(false)
  const [showLogHelp, setShowLogHelp] = useState(false)
  const inputRef = useRef(null)
  const isMac =
    typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files || [])
    const jsonl = selected.filter(
      (f) => f.name.endsWith('.jsonl') || f.name.endsWith('.json'),
    )
    setFiles(jsonl)
  }

  const totalSize = files.reduce((acc, f) => acc + f.size, 0)
  const totalMb = (totalSize / (1024 * 1024)).toFixed(1)

  const canSubmit = files.length > 0 && apiKey.trim().length > 0

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!canSubmit) return
    onSubmit({ files, apiKey: apiKey.trim(), name: name.trim() })
  }

  return (
    <form className="insight-form" onSubmit={handleSubmit}>
      <h2 className="modal-title">Run your insights</h2>
      <p className="modal-sub">
        Point us at your Claude Code logs, your name, and drop in your Anthropic API key.
        Everything runs against your local server.
      </p>

      <label className="field">
        <span className="field-label">
          Your name
          <span className="field-hint">how you want to be referred to</span>
        </span>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="John Doe"
          className="text-input mono"
          autoComplete="off"
          spellCheck={false}
        />
      </label>

      <div className="field">
        <span className="field-label">
          Claude Code logs
          <span className="field-hint">
            usually <code>~/.claude/projects</code>
          </span>
        </span>
        <label
          className="file-drop"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              inputRef.current?.click()
            }
          }}
        >
          <input
            ref={inputRef}
            type="file"
            webkitdirectory=""
            directory=""
            multiple
            onChange={handleFileChange}
            className="file-input-hidden"
          />
          {files.length === 0 ? (
            <>
              <div className="file-drop-icon">⌘</div>
              <div className="file-drop-text">
                <strong>Click to choose a folder</strong>
                <span className="file-drop-sub">We'll pick up the .jsonl transcripts inside</span>
              </div>
            </>
          ) : (
            <div className="file-drop-summary">
              <strong>{files.length}</strong> transcript{files.length === 1 ? '' : 's'} selected
              <span className="file-drop-sub">{totalMb} MB · click to change</span>
            </div>
          )}
        </label>
        <button
          type="button"
          className="field-help-toggle"
          onClick={() => setShowLogHelp((v) => !v)}
          aria-expanded={showLogHelp}
        >
          {showLogHelp ? '− hide steps' : '＋ where do I find these?'}
        </button>
        {showLogHelp && (
          <div className="field-help">
            {isMac ? (
              <ol className="field-help-list">
                <li>
                  Open <strong>Finder</strong> and press{' '}
                  <kbd>⇧</kbd>+<kbd>⌘</kbd>+<kbd>G</kbd>.
                </li>
                <li>
                  Paste <code>~/.claude/projects</code> and hit{' '}
                  <kbd>Return</kbd>.
                </li>
                <li>
                  Click <strong>Click to choose a folder</strong> above and
                  pick that folder.
                </li>
                <li>
                  Tip: in the file picker, press{' '}
                  <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>.</kbd> to toggle hidden folders.
                </li>
              </ol>
            ) : (
              <ol className="field-help-list">
                <li>
                  Open your file manager and enable{' '}
                  <strong>Show hidden files</strong>{' '}
                  (<kbd>Ctrl</kbd>+<kbd>H</kbd> on most Linux file managers).
                </li>
                <li>
                  Navigate to your home folder, then{' '}
                  <code>.claude/projects</code>.
                </li>
                <li>
                  Click <strong>Click to choose a folder</strong> above and
                  pick that folder.
                </li>
              </ol>
            )}
          </div>
        )}
      </div>

      <label className="field">
        <span className="field-label">
          Anthropic API key
          <span className="field-hint">stays in this session</span>
        </span>
        <div className="key-row">
          <input
            type={showKey ? 'text' : 'password'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="sk-ant-..."
            className="text-input mono"
            autoComplete="off"
            spellCheck={false}
          />
          <button
            type="button"
            className="key-toggle"
            onClick={() => setShowKey((s) => !s)}
          >
            {showKey ? 'hide' : 'show'}
          </button>
        </div>
      </label>

      <button
        type="submit"
        className="cta-primary cta-block"
        disabled={!canSubmit}
      >
        Run my insights
      </button>
    </form>
  )
}

function formatElapsed(secs) {
  const s = Math.max(0, Math.floor(secs))
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}m ${r}s`
}

function ProgressView({ progress, elapsed }) {
  return (
    <div className="progress-view">
      <div className="progress-eyebrow mono">analyzing</div>
      <div className="progress-phrase-wrap">
        <div className="progress-phrase">
          Decoding your sessions
          <span className="progress-dots">
            <span>.</span>
            <span>.</span>
            <span>.</span>
          </span>
          <span className="progress-elapsed mono">({formatElapsed(elapsed)})</span>
        </div>
      </div>
      <p className="progress-hint">
        Reading your transcripts and asking Claude what they reveal. Larger
        log folders take a bit longer.
      </p>
    </div>
  )
}

function NodeBody({ node }) {
  // Insight-style node
  if (node.title || node.insight) {
    return (
      <>
        {node.insight && (
          <div className="insight-section">
            <div className="insight-section-label">Insight</div>
            <p className="insight-section-text">{node.insight}</p>
          </div>
        )}
      </>
    )
  }
  // Observation-style leaf
  return (
    <>
      {node.think_feel && (
        <div className="insight-section">
          <div className="insight-section-label">Thinks / feels</div>
          <p className="insight-section-text">{node.think_feel}</p>
        </div>
      )}
      {node.actions && (
        <div className="insight-section">
          <div className="insight-section-label">Actions</div>
          <p className="insight-section-text">{node.actions}</p>
        </div>
      )}
    </>
  )
}

function nodeLabel(node, fallback = 'Evidence') {
  if (node.title) return {label: node.title, type: 'title'}
  if (node.observation) return {label: node.observation, type: 'observation'}
  return fallback
}

function InsightAccordion({ node, nodes, layerKeys, layerIdx, depth = 0 }) {
  const [open, setOpen] = useState(false)

  const childKey =
    layerIdx > 0 && layerKeys[layerIdx - 1] != null
      ? layerKeys[layerIdx - 1]
      : null
  const childLayer = childKey ? nodes[childKey] || [] : []
  const childById = new Map(
    childLayer.map((n) => [String(n.id), n]),
  )
  const mergedIds = node.merged || []
  const supporting = mergedIds
    .map((id) => childById.get(String(id)))
    .filter(Boolean)

  const hasChildren = supporting.length > 0

  return (
    <div
      className={`insight-card depth-${Math.min(depth, 4)} ${open ? 'is-open' : ''}`}
    >
      <button
        type="button"
        className="insight-card-head"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        disabled={!hasChildren && !node.insight && !node.think_feel && !node.actions}
      >
        <div className="insight-card-text">
          {
            nodeLabel(node).type === 'title' ? (
              <div className="insight-card-title">{nodeLabel(node).label}</div>
            ): null
          }
          {
            nodeLabel(node).type === 'observation' ? (
              <div className="insight-card-tagline">{nodeLabel(node).label}</div>
            ): null
          }
          {node.tagline && (
            <div className="insight-card-tagline">{node.tagline}</div>
          )}
        </div>
        <span
          className={`insight-card-chevron ${open ? 'is-open' : ''}`}
          aria-hidden
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="insight-card-body">
          <NodeBody node={node} />

          {hasChildren && (
            <div className="insight-section">
              <div className="insight-section-label">
                Supporting evidence
                <span className="insight-section-count mono">
                  {supporting.length}
                </span>
              </div>
              <div className="insight-evidence-list">
                {supporting.map((child) => (
                  <InsightAccordion
                    key={child.id}
                    node={child}
                    nodes={nodes}
                    layerKeys={layerKeys}
                    layerIdx={layerIdx - 1}
                    depth={depth + 1}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Visualize page ───────────────────────────────────────────────────────────
const VIZ_PAD = { l: 168, r: 32, t: 44, b: 44 }
const VIZ_HIT_R = 14
const VIZ_COLORS = {
  edgeNormal: '#dedede',
  edgeDim: '#efefef',
  edgeHL: '#cc6633',
  obs: '#c0c0c0',
  midFill: '#ffffff',
  midStroke: '#666666',
  top: '#1a1a1a',
  selected: '#cc6633',
  child: '#e0a87a',
  dimmed: '#e0e0e0',
  label: '#999',
}

function vizTrunc(s, n) {
  return s && s.length > n ? s.slice(0, n) + '…' : s || ''
}

function transformLattice(rawLattice) {
  const rawNodes = rawLattice?.nodes || {}
  const rawEdges = rawLattice?.edges || {}
  const layerKeys = Object.keys(rawNodes)
    .map((k) => Number(k))
    .filter((k) => !Number.isNaN(k))
    .sort((a, b) => a - b)

  const layers = layerKeys.map((key, li) =>
    (rawNodes[key] || []).map((n) => {
      const obsText =
        n.observation ||
        n.text ||
        [n.think_feel, n.actions].filter(Boolean).join(' — ') ||
        ''
      return {
        id: Number(n.id),
        layerIdx: li,
        text: obsText,
        title: n.title || '',
        tagline: n.tagline || '',
        insight: n.insight || '',
        context: n.context || '',
        group: (n.metadata || {}).input_session ?? 0,
      }
    }),
  )

  const edges = layerKeys.map((key, li) => {
    if (li === 0) return []
    return (rawEdges[key] || []).map((e) => ({
      higherNodeId: Number(e.source),
      lowerNodeId: Number(e.target),
    }))
  })

  return { layers, edges }
}

function VisualizePage({ data, onBack }) {
  const canvasRef = useRef(null)
  const areaRef = useRef(null)
  const tooltipRef = useRef(null)
  const stateRef = useRef({})
  const [panel, setPanel] = useState(null) // { node, layerIdx } or null

  // Selection helper exposed to chip clicks in the panel.
  const selectNode = (layerIdx, nodeId) => {
    const s = stateRef.current
    if (!s.transformed) return
    const node = s.transformed.layers[layerIdx]?.find((n) => n.id === nodeId)
    if (!node) return
    s.selected = { layerIdx, nodeId }
    s.computeHighlight()
    s.draw()
    setPanel({ node, layerIdx })
  }

  useEffect(() => {
    const transformed = transformLattice(data?.lattice)
    if (!transformed.layers.length) return

    const canvas = canvasRef.current
    const area = areaRef.current
    const tooltip = tooltipRef.current
    if (!canvas || !area) return

    const ctx = canvas.getContext('2d')

    const s = stateRef.current
    s.transformed = transformed
    s.view = { scale: 1, tx: 0, ty: 0 }
    s.selected = null
    s.highlight = { nodeStatus: new Map(), edgeKeys: new Set() }
    s.cssW = 0
    s.cssH = 0
    s.dpr = window.devicePixelRatio || 1
    s.nodeBasePos = null
    s.edgeCoords = null
    s.nodeById = null
    s.nodePosById = null

    const b2s = (bx, by) => ({
      x: bx * s.view.scale + s.view.tx,
      y: by * s.view.scale + s.view.ty,
    })

    const computeLayout = () => {
      const { layers, edges } = s.transformed
      const numLayers = layers.length
      const plotW = s.cssW - VIZ_PAD.l - VIZ_PAD.r
      const plotH = s.cssH - VIZ_PAD.t - VIZ_PAD.b

      s.nodeBasePos = layers.map((nodes, li) => {
        const by =
          VIZ_PAD.t + plotH * (1 - li / Math.max(numLayers - 1, 1))
        return nodes.map((n, i) => ({
          ...n,
          bx:
            VIZ_PAD.l +
            (nodes.length === 1
              ? plotW / 2
              : (i / (nodes.length - 1)) * plotW),
          by,
        }))
      })

      s.nodePosById = s.nodeBasePos.map(
        (lnodes) => new Map(lnodes.map((n) => [n.id, n])),
      )
      s.nodeById = layers.map(
        (nodes) => new Map(nodes.map((n) => [n.id, n])),
      )

      s.edgeCoords = []
      edges.forEach((layerEdges, li) => {
        if (li === 0) return
        layerEdges.forEach(({ higherNodeId, lowerNodeId }) => {
          const h = s.nodePosById[li].get(higherNodeId)
          const l = s.nodePosById[li - 1].get(lowerNodeId)
          if (!h || !l) return
          s.edgeCoords.push({
            x1: l.bx,
            y1: l.by,
            x2: h.bx,
            y2: h.by,
            key: `${li}:${higherNodeId}:${lowerNodeId}`,
          })
        })
      })
    }

    const computeHighlight = () => {
      const nodeStatus = new Map()
      const edgeKeys = new Set()
      if (s.selected) {
        const { layerIdx, nodeId } = s.selected
        nodeStatus.set(`${layerIdx}:${nodeId}`, 'selected')
        const queue = [{ li: layerIdx, id: nodeId }]
        while (queue.length) {
          const { li, id } = queue.shift()
          if (li === 0) continue
          ;(s.transformed.edges[li] || [])
            .filter((e) => e.higherNodeId === id)
            .forEach((e) => {
              edgeKeys.add(`${li}:${id}:${e.lowerNodeId}`)
              const key = `${li - 1}:${e.lowerNodeId}`
              if (!nodeStatus.has(key)) {
                nodeStatus.set(key, 'child')
                queue.push({ li: li - 1, id: e.lowerNodeId })
              }
            })
        }
      }
      s.highlight = { nodeStatus, edgeKeys }
    }
    s.computeHighlight = computeHighlight

    const nodeRadius = (li, isSelected) => {
      const base = li === 0 ? 5 : Math.min(5 + li * 2, 12)
      return isSelected ? base + 3 : base
    }

    const draw = () => {
      const { layers } = s.transformed
      const numLayers = layers.length
      const { nodeStatus, edgeKeys } = s.highlight
      const hasSel = s.selected !== null

      ctx.save()
      ctx.scale(s.dpr, s.dpr)
      ctx.clearRect(0, 0, s.cssW, s.cssH)

      // Axis labels
      ctx.font = '11px Inter, "Helvetica Neue", sans-serif'
      ctx.fillStyle = VIZ_COLORS.label
      ctx.textAlign = 'right'
      ctx.textBaseline = 'middle'
      s.nodeBasePos.forEach((lnodes, li) => {
        if (!lnodes.length) return
        const { y } = b2s(0, lnodes[0].by)
        const label = li === 0 ? 'Observations' : `L${li} Insights`
        ctx.fillText(label, VIZ_PAD.l - 10, y)
      })

      // Edges (batched)
      ctx.beginPath()
      ctx.strokeStyle = hasSel ? VIZ_COLORS.edgeDim : VIZ_COLORS.edgeNormal
      ctx.lineWidth = 1
      s.edgeCoords.forEach((e) => {
        if (edgeKeys.has(e.key)) return
        const p1 = b2s(e.x1, e.y1)
        const p2 = b2s(e.x2, e.y2)
        ctx.moveTo(p1.x, p1.y)
        ctx.lineTo(p2.x, p2.y)
      })
      ctx.stroke()

      if (edgeKeys.size) {
        ctx.beginPath()
        ctx.strokeStyle = VIZ_COLORS.edgeHL
        ctx.lineWidth = 1.5
        s.edgeCoords.forEach((e) => {
          if (!edgeKeys.has(e.key)) return
          const p1 = b2s(e.x1, e.y1)
          const p2 = b2s(e.x2, e.y2)
          ctx.moveTo(p1.x, p1.y)
          ctx.lineTo(p2.x, p2.y)
        })
        ctx.stroke()
      }

      // Nodes — bucketed
      const buckets = {
        dimmed: [],
        child: [],
        selected: [],
        obsN: [],
        midN: [],
        topN: [],
      }
      s.nodeBasePos.forEach((lnodes, li) => {
        lnodes.forEach((n) => {
          const status = nodeStatus.get(`${li}:${n.id}`)
          if (hasSel) {
            if (status === 'selected') buckets.selected.push({ n, li })
            else if (status === 'child') buckets.child.push({ n, li })
            else buckets.dimmed.push({ n, li })
          } else {
            if (li === 0) buckets.obsN.push({ n, li })
            else if (li === numLayers - 1) buckets.topN.push({ n, li })
            else buckets.midN.push({ n, li })
          }
        })
      })

      const fillBucket = (bucket, fill, stroke, strokeW) => {
        bucket.forEach(({ n, li }) => {
          const { x, y } = b2s(n.bx, n.by)
          const r = nodeRadius(li, false)
          ctx.beginPath()
          ctx.arc(x, y, r, 0, Math.PI * 2)
          ctx.fillStyle = fill
          ctx.fill()
          if (stroke) {
            ctx.strokeStyle = stroke
            ctx.lineWidth = strokeW || 1.5
            ctx.stroke()
          }
        })
      }

      fillBucket(buckets.dimmed, VIZ_COLORS.dimmed, null)
      fillBucket(buckets.child, VIZ_COLORS.child, null)
      fillBucket(buckets.obsN, VIZ_COLORS.obs, null)
      fillBucket(buckets.midN, VIZ_COLORS.midFill, VIZ_COLORS.midStroke, 1.5)
      fillBucket(buckets.topN, VIZ_COLORS.top, null)

      buckets.selected.forEach(({ n, li }) => {
        const { x, y } = b2s(n.bx, n.by)
        const r = nodeRadius(li, true)
        ctx.beginPath()
        ctx.arc(x, y, r, 0, Math.PI * 2)
        ctx.fillStyle = VIZ_COLORS.selected
        ctx.fill()
      })

      ctx.restore()
    }
    s.draw = draw

    const findNodeAt = (sx, sy) => {
      if (!s.nodeBasePos) return null
      let best = null
      let bestDist = Infinity
      s.nodeBasePos.forEach((lnodes) => {
        lnodes.forEach((n) => {
          const { x, y } = b2s(n.bx, n.by)
          const dx = x - sx
          const dy = y - sy
          const d = dx * dx + dy * dy
          if (d < VIZ_HIT_R * VIZ_HIT_R && d < bestDist) {
            best = n
            bestDist = d
          }
        })
      })
      return best
    }

    const resize = () => {
      s.dpr = window.devicePixelRatio || 1
      s.cssW = area.clientWidth
      s.cssH = area.clientHeight
      canvas.width = s.cssW * s.dpr
      canvas.height = s.cssH * s.dpr
      computeLayout()
      draw()
    }
    resize()

    let dragStart = null
    const onMouseDown = (e) => {
      dragStart = {
        mx: e.clientX,
        my: e.clientY,
        tx: s.view.tx,
        ty: s.view.ty,
        moved: false,
      }
      canvas.classList.add('panning')
    }
    const onWindowMouseMove = (e) => {
      if (!dragStart) return
      const dx = e.clientX - dragStart.mx
      const dy = e.clientY - dragStart.my
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragStart.moved = true
      if (dragStart.moved) {
        s.view.tx = dragStart.tx + dx
        s.view.ty = dragStart.ty + dy
        draw()
      }
    }
    const onWindowMouseUp = (e) => {
      if (!dragStart) return
      if (!dragStart.moved) {
        const rect = canvas.getBoundingClientRect()
        const node = findNodeAt(e.clientX - rect.left, e.clientY - rect.top)
        if (node) {
          if (
            s.selected &&
            s.selected.layerIdx === node.layerIdx &&
            s.selected.nodeId === node.id
          ) {
            s.selected = null
            setPanel(null)
          } else {
            s.selected = { layerIdx: node.layerIdx, nodeId: node.id }
            setPanel({ node, layerIdx: node.layerIdx })
          }
          computeHighlight()
          draw()
        }
      }
      dragStart = null
      canvas.classList.remove('panning')
    }
    const onWheel = (e) => {
      e.preventDefault()
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const delta = e.deltaY < 0 ? 1.1 : 0.9
      s.view.tx = mx - (mx - s.view.tx) * delta
      s.view.ty = my - (my - s.view.ty) * delta
      s.view.scale *= delta
      draw()
    }
    const onCanvasMouseMove = (e) => {
      if (dragStart && dragStart.moved) return
      const rect = canvas.getBoundingClientRect()
      const mx = e.clientX - rect.left
      const my = e.clientY - rect.top
      const node = findNodeAt(mx, my)
      if (!node) {
        tooltip.style.display = 'none'
        canvas.style.cursor = dragStart ? 'grabbing' : 'grab'
        return
      }
      canvas.style.cursor = 'pointer'
      tooltip.innerHTML =
        node.layerIdx === 0
          ? `<b>Obs ${node.id}</b><br>${vizTrunc(node.text, 120)}`
          : `<b>${vizTrunc(node.title, 60)}</b><br>${vizTrunc(node.insight, 120)}`
      tooltip.style.display = 'block'
      const tipW = tooltip.offsetWidth
      const areaW = area.clientWidth
      tooltip.style.left =
        (mx + 14 + tipW > areaW ? mx - tipW - 10 : mx + 14) + 'px'
      tooltip.style.top = my - 8 + 'px'
    }
    const onCanvasMouseLeave = () => {
      tooltip.style.display = 'none'
    }
    const onResize = () => resize()

    canvas.addEventListener('mousedown', onMouseDown)
    window.addEventListener('mousemove', onWindowMouseMove)
    window.addEventListener('mouseup', onWindowMouseUp)
    canvas.addEventListener('wheel', onWheel, { passive: false })
    canvas.addEventListener('mousemove', onCanvasMouseMove)
    canvas.addEventListener('mouseleave', onCanvasMouseLeave)
    window.addEventListener('resize', onResize)

    return () => {
      canvas.removeEventListener('mousedown', onMouseDown)
      window.removeEventListener('mousemove', onWindowMouseMove)
      window.removeEventListener('mouseup', onWindowMouseUp)
      canvas.removeEventListener('wheel', onWheel)
      canvas.removeEventListener('mousemove', onCanvasMouseMove)
      canvas.removeEventListener('mouseleave', onCanvasMouseLeave)
      window.removeEventListener('resize', onResize)
    }
  }, [data])

  const transformed = stateRef.current.transformed
  const numLayers = transformed?.layers?.length || 0

  return (
    <div className="app visualize-page">
      <header className="topbar">
        <button
          className="topbar-brand mono topbar-brand-button"
          onClick={onBack}
        >
          claude_decode
        </button>
        <div className="topbar-actions">
          <button className="cta-secondary" type="button" onClick={onBack}>
            ← Back to insights
          </button>
        </div>
      </header>

      <div className="visualize-main">
        <div className="visualize-canvas-area" ref={areaRef}>
          <canvas ref={canvasRef} className="visualize-canvas" />
          <div ref={tooltipRef} className="visualize-tooltip" />
        </div>
        <aside className={`visualize-panel ${panel ? '' : 'is-empty'}`}>
          {panel ? (
            <VisualizePanelContent
              node={panel.node}
              layerIdx={panel.layerIdx}
              transformed={transformed}
              numLayers={numLayers}
              onSelect={selectNode}
            />
          ) : (
            <span className="visualize-panel-empty">
              Click a node to explore
            </span>
          )}
        </aside>
      </div>
    </div>
  )
}

function VisualizePanelContent({ node, layerIdx, transformed, numLayers, onSelect }) {
  if (!transformed) return null
  const { edges } = transformed
  const isLeaf = layerIdx === 0
  const isTop = layerIdx === numLayers - 1
  const tagLabel = isLeaf
    ? 'Observation'
    : isTop && numLayers > 2
    ? 'Top-Level Insight'
    : `L${layerIdx} Insight`
  const tagClass = isLeaf ? 'leaf' : isTop ? '' : 'mid'

  const nodeAt = (li, id) =>
    transformed.layers[li]?.find((n) => n.id === id) || null

  // Children (lower layer) merged into this node
  const lowerLinked = !isLeaf
    ? (edges[layerIdx] || [])
        .filter((e) => e.higherNodeId === node.id)
        .map((e) => nodeAt(layerIdx - 1, e.lowerNodeId))
        .filter(Boolean)
    : []

  // Higher-layer insights this node was rolled up into
  const higherLinked = !isTop
    ? (edges[layerIdx + 1] || [])
        .filter((e) => e.lowerNodeId === node.id)
        .map((e) => nodeAt(layerIdx + 1, e.higherNodeId))
        .filter(Boolean)
    : []

  if (isLeaf) {
    return (
      <div className="visualize-panel-content">
        <div className={`viz-ptag ${tagClass}`}>{tagLabel}</div>
        <span className="viz-pbadge">
          Session {node.group} · ID {node.id}
        </span>
        <p className="viz-itext" style={{ marginTop: 10 }}>
          {node.text || ''}
        </p>
        {numLayers > 1 && higherLinked.length > 0 && (
          <>
            <div className="viz-slbl">Assigned to insight(s)</div>
            <div className="viz-chips">
              {higherLinked.map((hn) => (
                <button
                  key={hn.id}
                  className="viz-chip"
                  type="button"
                  onClick={() => onSelect(layerIdx + 1, hn.id)}
                >
                  {vizTrunc(hn.title, 42)}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="visualize-panel-content">
      <div className={`viz-ptag ${tagClass}`}>{tagLabel}</div>
      <span className="viz-pbadge">Session {node.group}</span>
      <h2 className="viz-ph2">{node.title}</h2>
      {node.tagline && <p className="viz-tagline">{node.tagline}</p>}
      <div className="viz-slbl">Insight</div>
      <p className="viz-itext">{node.insight}</p>
      {node.context && (
        <>
          <div className="viz-slbl">Context</div>
          <p className="viz-ctext">{node.context}</p>
        </>
      )}
      {lowerLinked.length > 0 && layerIdx === 1 && (
        <>
          <div className="viz-slbl">
            Evidence ({lowerLinked.length} observation
            {lowerLinked.length > 1 ? 's' : ''})
          </div>
          <div className="viz-evlist">
            {lowerLinked.slice(0, 5).map((ln) => (
              <button
                key={ln.id}
                className="viz-evitem"
                type="button"
                onClick={() => onSelect(0, ln.id)}
              >
                <strong>Obs {ln.id}</strong>
                <br />
                {vizTrunc(ln.text, 200)}
              </button>
            ))}
          </div>
          {lowerLinked.length > 5 && (
            <p className="viz-evmore">+ {lowerLinked.length - 5} more</p>
          )}
        </>
      )}
      {lowerLinked.length > 0 && layerIdx > 1 && (
        <>
          <div className="viz-slbl">
            Merged from L{layerIdx - 1} insights
          </div>
          <div className="viz-chips">
            {lowerLinked.map((ln) => (
              <button
                key={ln.id}
                className="viz-chip"
                type="button"
                onClick={() => onSelect(layerIdx - 1, ln.id)}
              >
                {vizTrunc(ln.title, 42)}
              </button>
            ))}
          </div>
        </>
      )}
      {!isTop && higherLinked.length > 0 && (
        <>
          <div className="viz-slbl">
            Included in L{layerIdx + 1} insight(s)
          </div>
          <div className="viz-chips">
            {higherLinked.map((hn) => (
              <button
                key={hn.id}
                className="viz-chip"
                type="button"
                onClick={() => onSelect(layerIdx + 1, hn.id)}
              >
                {vizTrunc(hn.title, 42)}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function LatticePage({ data, onReset, onVisualize }) {
  const topLayer = data?.top_layer || []
  const nodes = data?.lattice?.nodes || {}
  const layerKeys = Object.keys(nodes)
  const topLayerIdx = layerKeys.length - 1

  const handleSave = () => {
    const lattice = data?.lattice
    if (!lattice) return
    const blob = new Blob([JSON.stringify(lattice, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    a.download = `lattice-${ts}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="app">
      <header className="topbar">
        <button
          className="topbar-brand mono topbar-brand-button"
          onClick={onReset}
        >
          claude_decode
        </button>
        <div className="topbar-actions">
          <button
            className="cta-primary cta-compact"
            type="button"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </header>

      <main className="lattice-main">
        <div className="lattice-header">
          <div className="lattice-title-row">
            <h1 className="lattice-title">Claude Decode</h1>
            <button
              className="cta-secondary cta-with-icon"
              type="button"
              aria-label="Visualize insights"
              onClick={onVisualize}
            >
              <svg
                className="cta-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="6" cy="6" r="2.2" />
                <circle cx="18" cy="6" r="2.2" />
                <circle cx="12" cy="14" r="2.2" />
                <circle cx="6" cy="20" r="2.2" />
                <circle cx="18" cy="20" r="2.2" />
                <line x1="7.6" y1="7.2" x2="10.6" y2="12.8" />
                <line x1="16.4" y1="7.2" x2="13.4" y2="12.8" />
                <line x1="10.6" y1="15.2" x2="7.6" y2="18.8" />
                <line x1="13.4" y1="15.2" x2="16.4" y2="18.8" />
              </svg>
              Visualize Insights
            </button>
          </div>
          <p className="lattice-sub">
            Click any insight to see the full reasoning and the underlying
            insights it was synthesized from.
          </p>
        </div>

        {topLayer.length === 0 ? (
          <p className="lattice-empty">No insights were produced.</p>
        ) : (
          <div className="insight-list">
            {topLayer.map((insight, i) => (
              <InsightAccordion
                key={insight.id ?? i}
                node={insight}
                nodes={nodes}
                layerKeys={layerKeys}
                layerIdx={topLayerIdx}
                depth={0}
              />
            ))}
          </div>
        )}
      </main>

      <footer className="footer mono">
        Claude Decoded is a research prototype by{' '}
        <a href="https://hci.stanford.edu" target="_blank" rel="noreferrer">
          Stanford HCI
        </a>
        .
      </footer>
    </div>
  )
}

function ErrorView({ error, onReset }) {
  return (
    <div className="error-view">
      <div className="error-eyebrow mono">something broke</div>
      <p className="error-message">{error}</p>
      <button className="cta-secondary" onClick={onReset}>
        Try again
      </button>
    </div>
  )
}

function HowItWorks() {
  return (
    <div className="how-view">
      <div className="how-eyebrow mono">how it works</div>
      <h2 className="how-title">Behavior Latticing</h2>
      <p className="how-body">
        Claude Decode is built on top of <strong>Behavior Latticing</strong>, a
        method for inferring user motivations from unstructured interactions.
      </p>
      <p className="how-body">
        To learn more about behavior latticing, read{' '}
        <a
          href="https://arxiv.org/abs/2604.07629"
          target="_blank"
          rel="noreferrer"
          className="how-link"
        >
          our paper
        </a>
        . To build your own applications using behavior latticing, check out the{' '}
        <a
          href="https://stanfordhci.github.io/lattice/"
          target="_blank"
          rel="noreferrer"
          className="how-link"
        >
          API documentation
        </a>
        .
      </p>
    </div>
  )
}

const API_BASE = (import.meta.env.VITE_API_BASE || '').replace(/\/+$/, '')

// On GitHub Pages the app is served from /<repo>/, so we route relative to
// import.meta.env.BASE_URL (which Vite injects: '/' in dev, '/claude-decode/' in prod).
const ROUTE_BASE = (import.meta.env.BASE_URL || '/').replace(/\/$/, '')

function stripBase(pathname) {
  if (ROUTE_BASE && pathname.startsWith(ROUTE_BASE)) {
    return pathname.slice(ROUTE_BASE.length) || '/'
  }
  return pathname || '/'
}

function withBase(to) {
  return ROUTE_BASE + (to.startsWith('/') ? to : `/${to}`)
}

const LATTICE_STORAGE_KEY = 'claude-decoded:lattice'

function readStoredLattice() {
  try {
    const raw = sessionStorage.getItem(LATTICE_STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export default function App() {
  const [modalOpen, setModalOpen] = useState(false)
  const [howOpen, setHowOpen] = useState(false)
  const [phase, setPhase] = useState('form') // form | running | results | error
  const [progress, setProgress] = useState(0)
  const [elapsed, setElapsed] = useState(0)
  const [results, setResults] = useState(null)
  const [error, setError] = useState(null)
  const [path, setPath] = useState(
    typeof window !== 'undefined' ? stripBase(window.location.pathname) : '/',
  )
  const [latticeData, setLatticeData] = useState(() => readStoredLattice())

  useEffect(() => {
    const onPop = () => setPath(stripBase(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const navigate = (to) => {
    const target = withBase(to)
    if (window.location.pathname !== target) {
      window.history.pushState({}, '', target)
    }
    setPath(to)
  }

  // Elapsed-time + progress animation while running
  useEffect(() => {
    if (phase !== 'running') return
    const startedAt = Date.now()
    setElapsed(0)
    const elapsedTimer = setInterval(() => {
      setElapsed((Date.now() - startedAt) / 1000)
    }, 250)

    let p = 0
    const progressTimer = setInterval(() => {
      // Ease toward 95% so the bar feels alive but never completes until response
      p += Math.max(0.3, (95 - p) * 0.02)
      setProgress(p)
    }, 100)

    return () => {
      clearInterval(elapsedTimer)
      clearInterval(progressTimer)
    }
  }, [phase])

  const reset = () => {
    setPhase('form')
    setProgress(0)
    setElapsed(0)
    setResults(null)
    setError(null)
  }

  const closeModal = () => {
    setModalOpen(false)
    // small delay so the close animation can read state
    setTimeout(reset, 250)
  }

  const handleSubmit = async ({ files, apiKey }) => {
    setPhase('running')
    setProgress(0)
    setElapsed(0)

    try {
      const formData = new FormData()
      formData.append('api_key', apiKey)
      for (const f of files) {
        const stripped = await stripTranscriptFile(f)
        if (stripped) formData.append('files', stripped, f.name)
      }
      if (!formData.has('files')) {
        throw new Error(
          'No usable transcripts found in the selected folder. Make sure you picked the .claude/projects directory.',
        )
      }

      const res = await fetch(`${API_BASE}/api/insights`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || `Server returned ${res.status}`)
      }

      const queued = await res.json()
      const taskId = queued.task_id
      if (!taskId) {
        throw new Error('Server did not return a task id.')
      }

      const pollMs = 20000 // 20 seconds
      const maxWaitMs = 10 * 60 * 1000 // 10 minutes
      const started = Date.now()
      let data = null
      while (Date.now() - started < maxWaitMs) {
        const stRes = await fetch(`${API_BASE}/api/insights/task/${taskId}`)
        const st = await stRes.json().catch(() => ({}))
        if (!stRes.ok) {
          throw new Error(st.error || `Status check failed (${stRes.status})`)
        }
        if (st.state === 'FAILURE') {
          throw new Error(st.error || 'Insights task failed.')
        }
        if (st.state === 'SUCCESS') {
          const { state: _s, ...rest } = st
          data = rest
          break
        }
        await new Promise((r) => setTimeout(r, pollMs))
      }
      if (!data) {
        throw new Error('Timed out waiting for insights.')
      }

      setProgress(100)
      // brief beat at 100% before swapping to the lattice page
      setTimeout(() => {
        try {
          sessionStorage.setItem(LATTICE_STORAGE_KEY, JSON.stringify(data))
        } catch {
          // sessionStorage can fail (quota / private mode); fall back to memory
        }
        setLatticeData(data)
        setResults(data)
        setModalOpen(false)
        setPhase('form')
        setProgress(0)
        navigate('/lattice')
      }, 350)
    } catch (e) {
      setError(e.message || 'Unknown error')
      setPhase('error')
    }
  }

  if (path === '/lattice') {
    if (!latticeData) {
      // No data yet — bounce back to home so the user can run insights
      navigate('/')
      return null
    }
    return (
      <LatticePage
        data={latticeData}
        onReset={() => navigate('/')}
        onVisualize={() => navigate('/visualize')}
      />
    )
  }

  if (path === '/visualize') {
    if (!latticeData) {
      navigate('/')
      return null
    }
    return (
      <VisualizePage
        data={latticeData}
        onBack={() => navigate('/lattice')}
      />
    )
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand mono">claude_decode</div>
        <div className="topbar-actions">
          {latticeData && (
            <button
              className="topbar-link"
              onClick={() => navigate('/lattice')}
            >
              back to your decodings →
            </button>
          )}
          <button
            className="topbar-link"
            onClick={() => setHowOpen(true)}
          >
            how it works
          </button>
        </div>
      </header>

      <main className="main">
        <Hero onTryItOut={() => setModalOpen(true)} />
      </main>

      <footer className="footer mono">
        Claude Decode is a research prototype by <a href="https://hci.stanford.edu" target="_blank" rel="noreferrer">Stanford HCI</a>.
      </footer>

      <Modal open={modalOpen} onClose={closeModal}>
        {phase === 'form' && <InsightForm onSubmit={handleSubmit} />}
        {phase === 'running' && (
          <ProgressView progress={progress} elapsed={elapsed} />
        )}
        {phase === 'error' && (
          <ErrorView error={error} onReset={reset} />
        )}
      </Modal>

      <Modal open={howOpen} onClose={() => setHowOpen(false)}>
        <HowItWorks />
      </Modal>
    </div>
  )
}
