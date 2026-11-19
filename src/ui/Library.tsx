import { localId } from '../storage/identity'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ArrowRight,
  BookImage,
  Check,
  Compass,
  ExternalLink,
  Plus,
  Images,
  LoaderCircle,
  Pencil,
  Search,
  Trash2,
} from 'lucide-react'
import { collection } from '../library/collection'
import { readImage } from '../library/images'
import { httpUrl, importDiscovery, licenseName, searchImages, type Discovery } from '../library/openverse'
import { sourceNames, type Reference } from '../library/reference'
import { studioStore } from '../storage/studio'
import { IconButton, Modal, ReferenceThumb } from './components'

type Tab = 'studio' | 'upload' | 'openverse'
export function Library({
  select,
  initialFocus = 'studio',
}: {
  select: (r: Reference) => void
  initialFocus?: Tab
}) {
  const [tab, setTab] = useState<Tab>(initialFocus)
  const [personal, setPersonal] = useState<Reference[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [inspect, setInspect] = useState<Reference | null>(null)
  const [edit, setEdit] = useState<'rename' | 'remove' | null>(null)
  const [name, setName] = useState('')
  const file = useRef<HTMLInputElement>(null)
  useEffect(() => {
    let live = true
    studioStore
      .references()
      .then((data) => {
        if (live) setPersonal(data)
      })
      .catch(() => {
        if (live) setError('Your browser could not open the local image library.')
      })
    return () => {
      live = false
    }
  }, [])
  async function upload(files: FileList | null) {
    if (!files?.length) return
    const selected = Array.from(files)
    setBusy(true)
    setError('')
    setTab('upload')
    try {
      for (const f of selected) {
        const image = await readImage(f)
        const item: Reference = {
          ...image,
          id: 'local/' + localId(),
          title: f.name.replace(/\.[^.]+$/, '') || 'Untitled reference',
          source: 'upload',
          subject: 'Personal reference',
          creator: 'Your upload',
          license: 'Personal reference',
        }
        await studioStore.saveReference(item)
        setPersonal((list) => [...list, item])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The image could not be saved on this device.')
    } finally {
      setBusy(false)
      if (file.current) file.current.value = ''
    }
  }
  async function modify() {
    if (!inspect) return
    try {
      if (edit === 'remove') {
        await studioStore.removeReference(inspect.id)
        setPersonal((list) => list.filter((it) => it.id !== inspect.id))
        setInspect(null)
      } else {
        const updated = { ...inspect, title: name.trim() }
        if (!updated.title) return
        await studioStore.saveReference(updated)
        setPersonal((list) => list.map((it) => (it.id === updated.id ? updated : it)))
        setInspect(updated)
      }
      setEdit(null)
    } catch {
      setError('Local storage could not complete the change.')
      setEdit(null)
      setInspect(null)
    }
  }
  const items = tab === 'studio' ? collection : personal
  return (
    <main className="page library-page">
      <div className="page-heading">
        <div>
          <h1>Reference library</h1>
          <p>Choose a subject for your next drawing practice.</p>
        </div>
      </div>
      <div className="library-tabs" aria-label="Reference sources">
        {(
          [
            ['studio', 'Studio collection', BookImage],
            ['upload', 'My library', Images],
            ['openverse', 'Explore', Compass],
          ] as const
        ).map(([key, label, Icon]) => (
          <button
            key={key}
            aria-pressed={tab === key}
            className={tab === key ? 'current' : ''}
            onClick={() => {
              setTab(key)
              setError('')
            }}
          >
            <Icon size={17} />
            {label}
          </button>
        ))}
      </div>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {tab === 'openverse' ? (
        <Explore select={select} />
      ) : (
        <>
          <div className="collection-line">
            <h2>{tab === 'studio' ? 'Studio collection' : 'My library'}</h2>
            <span className="micro">
              {items.length} {items.length === 1 ? 'REFERENCE' : 'REFERENCES'}
            </span>
          </div>
          <div className="library-grid">
            {tab === 'upload' && (
              <>
                <button
                  className="library-card upload-card"
                  disabled={busy}
                  onClick={() => file.current?.click()}
                >
                  {busy ? <LoaderCircle className="spin" /> : <Plus />}
                  {busy ? 'Adding images…' : 'Add images'}
                </button>
                <input
                  hidden
                  ref={file}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/avif,image/gif,image/bmp"
                  aria-label="Upload reference files"
                  onChange={(e) => void upload(e.target.files)}
                />
              </>
            )}
            {items.map((item) => (
              <article className="library-card" key={item.id}>
                <button
                  className="card-image-button"
                  aria-label={'View ' + item.title}
                  onClick={() => {
                    setInspect(item)
                    setEdit(null)
                  }}
                >
                  <ReferenceThumb item={item} lazy />
                </button>
                <div className="library-card-info">
                  <span className="micro">{item.subject}</span>
                  <h3>{item.title}</h3>
                  <button className="text-button" onClick={() => select(item)}>
                    Use reference <ArrowRight size={15} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {inspect && (
        <Modal
          title={
            edit === 'remove' ? 'Remove reference?' : edit === 'rename' ? 'Rename reference' : inspect.title
          }
          onClose={() => {
            setInspect(null)
            setEdit(null)
          }}
        >
          {edit ? (
            <>
              {edit === 'remove' ? (
                <p>Remove “{inspect.title}” from My library? Saved sessions keep their own copy.</p>
              ) : (
                <label className="text-field">
                  Reference name
                  <input autoFocus value={name} maxLength={160} onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <div className="modal-actions">
                <button className="button" onClick={() => setEdit(null)}>
                  Cancel
                </button>
                <button
                  className="button primary"
                  disabled={edit === 'rename' && !name.trim()}
                  onClick={() => void modify()}
                >
                  {edit === 'remove' ? 'Remove image' : 'Save name'}
                </button>
              </div>
            </>
          ) : (
            <>
              <ReferenceThumb item={inspect} className="inspect-image" />
              <p className="credit">
                {sourceNames[inspect.source]} · {inspect.creator} ·{' '}
                {inspect.licenseUrl ? (
                  <a href={inspect.licenseUrl} target="_blank" rel="noreferrer">
                    {inspect.license}
                  </a>
                ) : (
                  inspect.license
                )}
              </p>
              <div className="modal-actions">
                {inspect.source === 'upload' && (
                  <div className="manage-actions">
                    <IconButton
                      label="Rename image"
                      onClick={() => {
                        setName(inspect.title)
                        setEdit('rename')
                      }}
                    >
                      <Pencil size={16} />
                    </IconButton>
                    <IconButton label="Remove image" onClick={() => setEdit('remove')}>
                      <Trash2 size={16} />
                    </IconButton>
                  </div>
                )}
                <button
                  className="button primary"
                  onClick={() => {
                    setInspect(null)
                    select(inspect)
                  }}
                >
                  Use reference <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </main>
  )
}

function Explore({ select }: { select: (r: Reference) => void }) {
  const [query, setQuery] = useState('still life')
  const [subject, setSubject] = useState('')
  const [results, setResults] = useState<Discovery[]>([])
  const [loading, setLoading] = useState(false)
  const [opening, setOpening] = useState('')
  const [error, setError] = useState('')
  const [search, setSearch] = useState({ query: 'still life', subject: '' })
  const importing = useRef<AbortController | null>(null)
  useEffect(() => {
    const controller = new AbortController()
    let live = true
    const timeout = window.setTimeout(() => controller.abort(), 15000)
    setLoading(true)
    setError('')
    setResults([])
    searchImages(search.query, search.subject, controller.signal)
      .then((items) => {
        if (live) setResults(items)
      })
      .catch(() => {
        if (live)
          setError(
            'Openverse could not be reached. Retry the search, or choose an image from Studio collection or My library.',
          )
      })
      .finally(() => {
        clearTimeout(timeout)
        if (live) setLoading(false)
      })
    return () => {
      live = false
      controller.abort()
      clearTimeout(timeout)
    }
  }, [search])
  useEffect(() => () => importing.current?.abort(), [])
  function submit(e: FormEvent) {
    e.preventDefault()
    setSearch({ query, subject })
  }
  async function useResult(item: Discovery) {
    importing.current?.abort()
    const controller = new AbortController()
    importing.current = controller
    const timeout = window.setTimeout(() => controller.abort('timeout'), 18000)
    setOpening(item.id)
    setError('')
    try {
      const reference = await importDiscovery(item, controller.signal)
      if (!controller.signal.aborted) select(reference)
    } catch (err) {
      if (controller.signal.reason === 'timeout')
        setError('This image took too long to open. Try a different reference.')
      else if (!controller.signal.aborted)
        setError(err instanceof Error ? err.message : 'The image could not be opened.')
    } finally {
      clearTimeout(timeout)
      if (importing.current === controller) setOpening('')
    }
  }
  return (
    <section className="explore">
      <div className="collection-line">
        <h2>Explore Openverse</h2>
      </div>
      <form className="search-form" onSubmit={submit}>
        <label className="search-input">
          <Search size={17} />
          <input
            type="search"
            aria-label="Search openly licensed images"
            value={query}
            placeholder="Search openly licensed images"
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <select
          aria-label="Subject filter"
          value={subject}
          onChange={(e) => {
            setSubject(e.target.value)
            setSearch({ query, subject: e.target.value })
          }}
        >
          <option value="">All subjects</option>
          {['Still life', 'Botanical', 'Architecture', 'Animals', 'Figure'].map((x) => (
            <option key={x}>{x}</option>
          ))}
        </select>
        <button className="button primary" type="submit">
          Search
        </button>
      </form>
      {error && (
        <p className="error-message" role="alert">
          {error}
        </p>
      )}
      {loading && (
        <div className="inline-status" role="status">
          <LoaderCircle size={19} className="spin" /> Searching Openverse…
        </div>
      )}
      {!loading && !error && !results.length && (
        <p>No references matched this search. Try another subject.</p>
      )}
      <div className="library-grid">
        {results.map((item) => (
          <article className="library-card" key={item.id}>
            <img
              className="discovery-image"
              src={httpUrl(item.thumbnail)}
              alt={item.title || 'Openverse reference'}
              loading="lazy"
            />
            <div className="library-card-info">
              <h3>{item.title || 'Untitled study'}</h3>
              <p className="credit">
                {item.creator || 'Creator unlisted'} ·{' '}
                <a href={httpUrl(item.license_url)} target="_blank" rel="noreferrer">
                  {licenseName(item)}
                </a>
              </p>
              <div className="result-actions">
                <button className="text-button" disabled={!!opening} onClick={() => void useResult(item)}>
                  {opening === item.id ? 'Opening…' : 'Use reference'} <Check size={15} />
                </button>
                {httpUrl(item.foreign_landing_url) && (
                  <a
                    href={httpUrl(item.foreign_landing_url)}
                    title="Original source"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink size={16} />
                  </a>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  )
}
