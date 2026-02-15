import { useState, useRef, useEffect } from 'react';
import { useInvoiceTemplate } from '../hooks/useDatabase';
import { InvoiceSection } from '../types';
import Cropper, { Area } from 'react-easy-crop';
import { getImageUrlType, pickImage, saveImageFromBuffer } from '../utils/imageStorage';

interface InvoiceEditorProps {
    onClose: () => void;
}

export function InvoiceEditor({ onClose }: InvoiceEditorProps) {
    const { template, saveTemplate, resetToDefault, loading } = useInvoiceTemplate();
    const [localTemplate, setLocalTemplate] = useState(template);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    // Cropper State
    const [croppingImage, setCroppingImage] = useState<string | null>(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

    const onCropComplete = (_croppedArea: Area, croppedAreaPixels: Area) => {
        setCroppedAreaPixels(croppedAreaPixels);
    };

    const handleBrowseClick = async () => {
        try {
            const imageUrl = await pickImage();
            if (imageUrl) {
                setCroppingImage(imageUrl);
                setZoom(1);
                setCrop({ x: 0, y: 0 });
            }
        } catch (error) {
            console.error('Failed to pick image:', error);
            setMessage({ type: 'error', text: 'Failed to pick image' });
        }
    };

    const handleApplyCrop = async () => {
        if (!croppingImage || !croppedAreaPixels) return;

        try {
            const image = new Image();
            image.src = croppingImage;
            await new Promise((resolve) => { image.onload = resolve; });

            const canvas = document.createElement('canvas');
            canvas.width = croppedAreaPixels.width;
            canvas.height = croppedAreaPixels.height;
            const ctx = canvas.getContext('2d');

            if (!ctx) return;

            ctx.drawImage(
                image,
                croppedAreaPixels.x,
                croppedAreaPixels.y,
                croppedAreaPixels.width,
                croppedAreaPixels.height,
                0,
                0,
                croppedAreaPixels.width,
                croppedAreaPixels.height
            );

            canvas.toBlob(async (blob) => {
                if (!blob) return;

                // Convert to Base64 for reliable display and storage
                const reader = new FileReader();
                reader.readAsDataURL(blob);
                reader.onloadend = async () => {
                    const base64data = reader.result as string;

                    // Still save to file to respect "local copy" requirement and for potential future use
                    const buffer = await blob.arrayBuffer();
                    await saveImageFromBuffer(new Uint8Array(buffer), `banner_${Date.now()}.png`);

                    // Use Base64 for the template
                    setLocalTemplate({ ...localTemplate, banner_image_url: base64data });
                    setCroppingImage(null);
                    setMessage({ type: 'success', text: 'Banner updated!' });
                    setTimeout(() => setMessage(null), 2000);
                };
            }, 'image/png');

        } catch (error) {
            console.error('Failed to apply crop:', error);
            setMessage({ type: 'error', text: 'Failed to save cropped image' });
        }
    };


    // Sync local state with loaded template when it changes
    useEffect(() => {
        setLocalTemplate(template);
    }, [template]);

    const handleDragStart = (index: number) => {
        dragItem.current = index;
    };

    const handleDragEnter = (index: number) => {
        dragOverItem.current = index;
    };

    const handleDragEnd = () => {
        if (dragItem.current === null || dragOverItem.current === null) return;
        if (dragItem.current === dragOverItem.current) return;

        const newSections = [...localTemplate.sections];
        const draggedItem = newSections[dragItem.current];

        // Remove dragged item
        newSections.splice(dragItem.current, 1);
        // Insert at new position
        newSections.splice(dragOverItem.current, 0, draggedItem);

        // Update order values
        const reordered = newSections.map((section, idx) => ({
            ...section,
            order: idx
        }));

        setLocalTemplate({ ...localTemplate, sections: reordered });
        dragItem.current = null;
        dragOverItem.current = null;
    };

    const toggleSection = (id: string) => {
        const newSections = localTemplate.sections.map(section =>
            section.id === id ? { ...section, enabled: !section.enabled } : section
        );
        setLocalTemplate({ ...localTemplate, sections: newSections });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await saveTemplate(localTemplate);
            setMessage({ type: 'success', text: 'Template saved!' });
            setTimeout(() => setMessage(null), 2000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to save template' });
        } finally {
            setSaving(false);
        }
    };

    const handleReset = async () => {
        setSaving(true);
        try {
            await resetToDefault();
            setLocalTemplate({
                sections: [
                    { id: 'header', type: 'header', label: 'Header', enabled: true, order: 0 },
                    { id: 'greeting', type: 'greeting', label: 'Greeting', enabled: true, order: 1 },
                    { id: 'qr_code', type: 'qr_code', label: 'QR Code & Confirmation', enabled: true, order: 2 },
                    { id: 'items_table', type: 'items_table', label: 'Items Table', enabled: true, order: 3 },
                    { id: 'total', type: 'total', label: 'Total Amount', enabled: true, order: 4 },
                    { id: 'footer', type: 'footer', label: 'Footer', enabled: true, order: 5 }
                ],
                header_title: 'Pre-Order Invoice',
                header_subtitle: 'Thank you for your order!',
                footer_text: 'This is an automated email from POTracker',
                primary_color: '#6366f1',
                secondary_color: '#a855f7',
                use_banner_image: false,
                banner_image_url: ''
            });
            setMessage({ type: 'success', text: 'Template reset to default!' });
            setTimeout(() => setMessage(null), 2000);
        } catch (error) {
            setMessage({ type: 'error', text: 'Failed to reset template' });
        } finally {
            setSaving(false);
        }
    };

    const getSectionIcon = (type: InvoiceSection['type']) => {
        switch (type) {
            case 'header': return '🎨';
            case 'greeting': return '👋';
            case 'qr_code': return '📱';
            case 'items_table': return '📋';
            case 'total': return '💰';
            case 'footer': return '📝';
            default: return '📄';
        }
    };

    if (loading) {
        return (
            <div className="modal-overlay">
                <div className="modal" style={{ maxWidth: '800px' }}>
                    <div className="loading">
                        <div className="spinner"></div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '900px', maxHeight: '90vh', overflow: 'auto' }}>
                <div className="modal-header">
                    <h3 className="modal-title">📧 Invoice Template Editor</h3>
                    <button className="modal-close" onClick={onClose}>×</button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-lg)' }}>
                    {/* Left: Section Order */}
                    <div>
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>📦 Sections (Drag to Reorder)</h4>
                        <div className="invoice-sections-list">
                            {localTemplate.sections
                                .sort((a, b) => a.order - b.order)
                                .map((section, index) => (
                                    <div
                                        key={section.id}
                                        className={`invoice-section-item ${section.enabled ? '' : 'disabled'}`}
                                        draggable
                                        onDragStart={() => handleDragStart(index)}
                                        onDragEnter={() => handleDragEnter(index)}
                                        onDragEnd={handleDragEnd}
                                        onDragOver={(e) => e.preventDefault()}
                                    >
                                        <div className="invoice-section-drag">⋮⋮</div>
                                        <span className="invoice-section-icon">{getSectionIcon(section.type)}</span>
                                        <span className="invoice-section-label">{section.label}</span>
                                        <label className="toggle-switch">
                                            <input
                                                type="checkbox"
                                                checked={section.enabled}
                                                onChange={() => toggleSection(section.id)}
                                            />
                                            <span className="toggle-slider"></span>
                                        </label>
                                    </div>
                                ))}
                        </div>
                    </div>

                    {/* Right: Template Settings */}
                    <div>
                        <h4 style={{ marginBottom: 'var(--space-md)' }}>⚙️ Template Settings</h4>

                        <div className="form-group">
                            <label className="form-label">Header Title</label>
                            <input
                                type="text"
                                className="form-input"
                                value={localTemplate.header_title}
                                onChange={(e) => setLocalTemplate({ ...localTemplate, header_title: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Header Subtitle</label>
                            <input
                                type="text"
                                className="form-input"
                                value={localTemplate.header_subtitle}
                                onChange={(e) => setLocalTemplate({ ...localTemplate, header_subtitle: e.target.value })}
                            />
                        </div>

                        <div className="form-group">
                            <label className="form-label">Footer Text</label>
                            <input
                                type="text"
                                className="form-input"
                                value={localTemplate.footer_text}
                                onChange={(e) => setLocalTemplate({ ...localTemplate, footer_text: e.target.value })}
                            />
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
                            <div className="form-group">
                                <label className="form-label">Primary Color</label>
                                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={localTemplate.primary_color}
                                        onChange={(e) => setLocalTemplate({ ...localTemplate, primary_color: e.target.value })}
                                        style={{ width: '50px', height: '40px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                        disabled={localTemplate.use_banner_image}
                                    />
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={localTemplate.primary_color}
                                        onChange={(e) => setLocalTemplate({ ...localTemplate, primary_color: e.target.value })}
                                        style={{ flex: 1 }}
                                        disabled={localTemplate.use_banner_image}
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Secondary Color</label>
                                <div style={{ display: 'flex', gap: 'var(--space-sm)', alignItems: 'center' }}>
                                    <input
                                        type="color"
                                        value={localTemplate.secondary_color}
                                        onChange={(e) => setLocalTemplate({ ...localTemplate, secondary_color: e.target.value })}
                                        style={{ width: '50px', height: '40px', border: 'none', borderRadius: 'var(--radius-sm)', cursor: 'pointer' }}
                                        disabled={localTemplate.use_banner_image}
                                    />
                                    <input
                                        type="text"
                                        className="form-input"
                                        value={localTemplate.secondary_color}
                                        onChange={(e) => setLocalTemplate({ ...localTemplate, secondary_color: e.target.value })}
                                        style={{ flex: 1 }}
                                        disabled={localTemplate.use_banner_image}
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Banner Image Option */}
                        <div className="form-group" style={{ marginTop: 'var(--space-md)' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-sm)' }}>
                                <label className="form-label" style={{ margin: 0 }}>Use Banner Image</label>
                                <label className="toggle-switch">
                                    <input
                                        type="checkbox"
                                        checked={localTemplate.use_banner_image}
                                        onChange={(e) => setLocalTemplate({ ...localTemplate, use_banner_image: e.target.checked })}
                                    />
                                    <span className="toggle-slider"></span>
                                </label>
                            </div>
                            {localTemplate.use_banner_image && (
                                <div>
                                    <label className="form-label">Banner Image</label>
                                    <div style={{ display: 'flex', gap: 'var(--space-sm)', marginBottom: 'var(--space-sm)' }}>
                                        <input
                                            type="text"
                                            className="form-input"
                                            value={localTemplate.banner_image_url}
                                            onChange={(e) => setLocalTemplate({ ...localTemplate, banner_image_url: e.target.value })}
                                            placeholder="https://example.com/banner.jpg"
                                            style={{ flex: 1 }}
                                        />
                                        <button
                                            type="button"
                                            className="btn btn-secondary"
                                            onClick={handleBrowseClick}
                                        >
                                            📁 Browse
                                        </button>
                                    </div>
                                    {localTemplate.banner_image_url && (
                                        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)', marginBottom: 'var(--space-sm)' }}>
                                            {getImageUrlType(localTemplate.banner_image_url) === 'local' ? '📁 Local file' :
                                                getImageUrlType(localTemplate.banner_image_url) === 'remote' ? '🌐 Remote URL' : ''}
                                        </div>
                                    )}
                                    <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-text-muted)' }}>
                                        Enter a URL or click Browse to upload a local image. Recommended size: 600x150 pixels.
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Preview */}
                <div style={{ marginTop: 'var(--space-lg)' }}>
                    <h4 style={{ marginBottom: 'var(--space-md)' }}>👁️ Preview</h4>
                    <div className="invoice-preview">
                        {localTemplate.sections
                            .filter(s => s.enabled)
                            .sort((a, b) => a.order - b.order)
                            .map(section => (
                                <div key={section.id} className="invoice-preview-section">
                                    {section.type === 'header' && (
                                        <div
                                            className="preview-header"
                                            style={localTemplate.use_banner_image && localTemplate.banner_image_url
                                                ? { backgroundImage: `url(${localTemplate.banner_image_url})`, backgroundSize: 'cover', backgroundPosition: 'center' }
                                                : { background: `linear-gradient(135deg, ${localTemplate.primary_color}, ${localTemplate.secondary_color})` }
                                            }
                                        >
                                            <h2>🧾 {localTemplate.header_title}</h2>
                                            <p>{localTemplate.header_subtitle}</p>
                                        </div>
                                    )}
                                    {section.type === 'greeting' && (
                                        <div className="preview-greeting">
                                            <p>Dear <strong>[Customer Name]</strong>,</p>
                                            <p>Thank you for your pre-order. Please find your order details below:</p>
                                        </div>
                                    )}
                                    {section.type === 'qr_code' && (
                                        <div className="preview-qr">
                                            <div className="preview-qr-box" style={{ borderColor: localTemplate.primary_color }}>
                                                <p>Your Confirmation Code:</p>
                                                <div className="preview-qr-placeholder">📱 QR</div>
                                                <div className="preview-code" style={{ color: localTemplate.primary_color }}>XXXXXX</div>
                                            </div>
                                        </div>
                                    )}
                                    {section.type === 'items_table' && (
                                        <div className="preview-table">
                                            <table>
                                                <thead>
                                                    <tr>
                                                        <th>Product</th>
                                                        <th>Qty</th>
                                                        <th>Price</th>
                                                        <th>Subtotal</th>
                                                    </tr>
                                                </thead>
                                                <tbody>
                                                    <tr>
                                                        <td>Sample Product</td>
                                                        <td>1</td>
                                                        <td>$10.00</td>
                                                        <td>$10.00</td>
                                                    </tr>
                                                </tbody>
                                            </table>
                                        </div>
                                    )}
                                    {section.type === 'total' && (
                                        <div className="preview-total">
                                            <span className="total-label">Total:</span>
                                            <span className="total-amount" style={{ color: localTemplate.primary_color }}>$10.00</span>
                                        </div>
                                    )}
                                    {section.type === 'footer' && (
                                        <div className="preview-footer">
                                            <p>{localTemplate.footer_text}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                </div>

                {/* Actions */}
                <div className="btn-group" style={{ justifyContent: 'space-between', marginTop: 'var(--space-lg)' }}>
                    <button className="btn btn-secondary" onClick={handleReset} disabled={saving}>
                        🔄 Reset to Default
                    </button>
                    <div className="btn-group">
                        <button className="btn btn-secondary" onClick={onClose}>
                            Cancel
                        </button>
                        <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
                            {saving ? '⏳ Saving...' : '💾 Save Template'}
                        </button>
                    </div>
                </div>

                {message && (
                    <div className={`toast ${message.type}`} style={{ position: 'absolute', bottom: '20px', right: '20px' }}>
                        {message.text}
                    </div>
                )}
            </div>
            {croppingImage && (
                <div className="modal-overlay" style={{ zIndex: 2000 }} onClick={(e) => e.stopPropagation()}>
                    <div className="modal" style={{ width: '90%', maxWidth: '600px', height: '80vh', display: 'flex', flexDirection: 'column' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">✂️ Crop Banner Image</h3>
                        </div>
                        <div style={{ position: 'relative', flex: 1, background: '#333' }}>
                            <Cropper
                                image={croppingImage}
                                crop={crop}
                                zoom={zoom}
                                aspect={4 / 1} // Banner aspect ratio
                                onCropChange={setCrop}
                                onCropComplete={onCropComplete}
                                onZoomChange={setZoom}
                            />
                        </div>
                        <div style={{ padding: 'var(--space-md)' }}>
                            <div style={{ marginBottom: 'var(--space-md)' }}>
                                <label style={{ display: 'block', marginBottom: 'var(--space-xs)' }}>Zoom</label>
                                <input
                                    type="range"
                                    value={zoom}
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    aria-labelledby="Zoom"
                                    onChange={(e) => setZoom(Number(e.target.value))}
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                                <button className="btn btn-secondary" onClick={() => setCroppingImage(null)}>
                                    Cancel
                                </button>
                                <button className="btn btn-primary" onClick={handleApplyCrop}>
                                    Apply Crop
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
