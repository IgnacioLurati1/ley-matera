import { useEffect, useState } from 'react';
import { useData } from '../../context/DataContext';
import { useUI } from '../../context/UIContext';
import ImageDrop from '../../components/ImageDrop';
import { getImageSize, previewDataUrl, resizedVariants, tinyPlaceholder } from '../../lib/image';
import { ABOUT_SIZES, BACKGROUND_SIZES, removeVariants, uploadVariants } from '../../lib/media';
import { DEFAULT_ABOUT_IMAGE, DEFAULT_HERO, heroFrom } from '../../lib/siteContent';
import { assetUrl } from '../../lib/assets';
import { whatsappFrom, whatsappLink, whatsappNumberFrom } from '../../config/site';

const DEFAULT_ABOUT = { title: 'Somos Ley Matera', body: '', image: DEFAULT_ABOUT_IMAGE, imageY: null };

// Foto elegida y todavía no guardada: `raw` es el original (se sube en buena
// calidad) y `preview` una copia liviana para mostrar acá.
function usePhoto() {
  const [photo, setPhoto] = useState(null);
  const [warning, setWarning] = useState('');
  const pick = async (dataUrl, minWidth) => {
    const { width } = await getImageSize(dataUrl);
    setWarning(width < minWidth ? `La foto mide ${width} px de ancho; se recomienda ${minWidth} px o más.` : '');
    setPhoto({ raw: dataUrl, preview: await previewDataUrl(dataUrl, 1280) });
  };
  return { photo, warning, pick, reset: () => (setPhoto(null), setWarning('')) };
}

// Sube la foto nueva (si hay), guarda la sección y borra la foto anterior.
// Con `placeholder`, guarda también la copia diminuta de la foto nueva.
async function saveSection({ key, value, photo, sizes, previous, updateSettings, placeholder = false }) {
  let image = value.image;
  const extra = {};
  if (photo) {
    image = await uploadVariants('sitio', key, await resizedVariants(photo.raw, sizes));
    if (placeholder) extra.placeholder = await tinyPlaceholder(photo.raw);
  }
  await updateSettings({ [key]: { ...value, ...extra, image } });
  if (previous && previous !== image) removeVariants(previous, sizes);
  return image;
}

function PositionSlider({ value, fallback, onChange }) {
  return (
    <label className="field">
      <span>Encuadre vertical</span>
      <input
        type="range"
        min="0"
        max="100"
        value={value ?? fallback}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <small>
        Arrastrá para elegir qué parte de la foto se ve (arriba ↔ abajo).{' '}
        {value != null && (
          <button type="button" className="btn btn--sm btn--ghost" onClick={() => onChange(null)}>
            Volver al automático
          </button>
        )}
      </small>
    </label>
  );
}

function HeroEditor() {
  const { settings, updateSettings } = useData();
  const { run } = useUI();
  const [hero, setHero] = useState(DEFAULT_HERO);
  const { photo, warning, pick, reset } = usePhoto();

  useEffect(() => {
    setHero(heroFrom(settings?.hero));
  }, [settings?.hero]);

  const set = (patch) => setHero((h) => ({ ...h, ...patch }));
  const shown = photo?.preview ?? hero.image;

  return (
    <div className="panel">
      <h2>Inicio: parte de arriba</h2>
      <div className="hero-preview" style={{ backgroundImage: `url("${assetUrl(shown)}")`, backgroundPositionY: `${hero.posY ?? 62}%` }}>
        <div>
          <strong>{hero.title || 'Título'}</strong>
          {hero.text && <p>{hero.text}</p>}
        </div>
      </div>

      <div className="admin-grid-2">
        <div>
          <label className="field">
            <span>Título</span>
            <input className="input" value={hero.title} maxLength={40} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Descripción</span>
            <textarea
              className="textarea"
              value={hero.text}
              maxLength={200}
              onChange={(e) => set({ text: e.target.value })}
            />
            <small>{hero.text.length}/200. Si la dejás vacía, sólo se ve el título.</small>
          </label>
        </div>
        <div>
          <div className="field">
            <span>Foto</span>
            <ImageDrop onImage={(src) => pick(src, 1920)} hint="Horizontal, 1920 px de ancho o más" />
            {warning && <small style={{ color: 'var(--danger)' }}>{warning}</small>}
            {(photo || hero.image !== DEFAULT_HERO.image) && (
              <small>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    reset();
                    set({ image: DEFAULT_HERO.image });
                  }}
                >
                  Usar la foto original
                </button>
              </small>
            )}
          </div>
          <PositionSlider value={hero.posY} fallback={62} onChange={(posY) => set({ posY })} />
        </div>
      </div>

      <button
        className="btn"
        disabled={!hero.title.trim()}
        onClick={() =>
          run(async () => {
            const image = await saveSection({
              key: 'hero',
              // La copia difuminada de la foto de siempre ya viene en el código.
              value: {
                ...hero,
                title: hero.title.trim(),
                text: hero.text.trim(),
                placeholder: hero.image === DEFAULT_HERO.image ? null : hero.placeholder,
              },
              photo,
              placeholder: true,
              sizes: BACKGROUND_SIZES,
              previous: settings?.hero?.image,
              updateSettings,
            });
            reset();
            set({ image });
          }, 'Inicio actualizado')
        }
      >
        Guardar inicio
      </button>
    </div>
  );
}

function AboutEditor() {
  const { settings, updateSettings } = useData();
  const { run } = useUI();
  const [about, setAbout] = useState(DEFAULT_ABOUT);
  const { photo, warning, pick, reset } = usePhoto();

  useEffect(() => {
    if (settings?.about) setAbout({ ...DEFAULT_ABOUT, ...settings.about });
  }, [settings?.about]);

  const set = (patch) => setAbout((a) => ({ ...a, ...patch }));
  const shown = photo?.preview ?? about.image;

  return (
    <div className="panel">
      <h2>Conocenos</h2>
      <div className="admin-grid-2">
        <div>
          <label className="field">
            <span>Título</span>
            <input className="input" value={about.title} onChange={(e) => set({ title: e.target.value })} />
          </label>
          <label className="field">
            <span>Texto</span>
            <textarea
              className="textarea"
              style={{ minHeight: 180 }}
              value={about.body}
              onChange={(e) => set({ body: e.target.value })}
            />
            <small>Cada salto de línea es un párrafo nuevo.</small>
          </label>
        </div>
        <div>
          <div className="about-preview">
            <img src={assetUrl(shown)} alt="" style={{ objectPosition: `50% ${about.imageY ?? 36}%` }} />
          </div>
          <div className="field">
            <span>Foto</span>
            <ImageDrop onImage={(src) => pick(src, 960)} hint="960 px de ancho o más; se muestra cuadrada" />
            {warning && <small style={{ color: 'var(--danger)' }}>{warning}</small>}
            {(photo || about.image !== DEFAULT_ABOUT_IMAGE) && (
              <small>
                <button
                  type="button"
                  className="btn btn--sm btn--ghost"
                  onClick={() => {
                    reset();
                    set({ image: DEFAULT_ABOUT_IMAGE });
                  }}
                >
                  Usar la foto original
                </button>
              </small>
            )}
          </div>
          <PositionSlider value={about.imageY} fallback={36} onChange={(imageY) => set({ imageY })} />
        </div>
      </div>
      <button
        className="btn"
        onClick={() =>
          run(async () => {
            const image = await saveSection({
              key: 'about',
              value: about,
              photo,
              sizes: ABOUT_SIZES,
              previous: settings?.about?.image,
              updateSettings,
            });
            reset();
            set({ image });
          }, 'Conocenos actualizado')
        }
      >
        Guardar Conocenos
      </button>
    </div>
  );
}

// Número al que llegan los pedidos del carrito, las consultas y el botón de redes.
function WhatsAppEditor() {
  const { settings, updateSettings } = useData();
  const { run } = useUI();
  const current = whatsappFrom(settings?.whatsapp);
  const [display, setDisplay] = useState(current.display);

  useEffect(() => {
    setDisplay(whatsappFrom(settings?.whatsapp).display);
  }, [settings?.whatsapp]);

  const number = whatsappNumberFrom(display);
  const changed = display.trim() !== current.display;

  return (
    <div className="panel">
      <h2>WhatsApp</h2>
      <p className="hint">
        A este número llegan los pedidos del carrito, las consultas y el botón de WhatsApp del sitio.
      </p>
      <div className="admin-grid-2">
        <label className="field">
          <span>Número</span>
          <input
            className="input"
            inputMode="tel"
            value={display}
            maxLength={24}
            onChange={(e) => setDisplay(e.target.value)}
            placeholder="Ej: 341 611 1209"
          />
          <small>Código de área sin el 0 y número sin el 15. Así se muestra en Contacto.</small>
          {!number && display.trim() && (
            <small style={{ color: 'var(--danger)' }}>Tiene que tener 10 números (ej: 341 611 1209).</small>
          )}
        </label>
        <div className="field">
          <span>Probar</span>
          <a
            className={`btn btn--whatsapp btn--sm ${number ? '' : 'is-disabled'}`}
            href={number ? whatsappLink('Prueba desde el panel de Ley Matera', number) : undefined}
            target="_blank"
            rel="noreferrer"
            aria-disabled={!number}
            style={{ alignSelf: 'flex-start' }}
          >
            Abrir chat con {number ? `+${number}` : '…'}
          </a>
          <small>Abrí el chat antes de guardar para confirmar que es el número correcto.</small>
        </div>
      </div>
      <button
        className="btn"
        disabled={!number || !changed}
        onClick={() => run(() => updateSettings({ whatsapp: { display: display.trim() } }), 'WhatsApp guardado')}
      >
        Guardar WhatsApp
      </button>
    </div>
  );
}

export default function DataAdmin() {
  return (
    <>
      <WhatsAppEditor />
      <HeroEditor />
      <AboutEditor />
    </>
  );
}
