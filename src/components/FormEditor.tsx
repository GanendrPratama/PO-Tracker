import { useState, useRef } from 'react';
import { Product } from '../types';

interface FormEditorProps {
    products: Product[];
    onSave: (orderedProducts: Product[]) => void;
    onCancel: () => void;
}

export function FormEditor({ products, onSave, onCancel }: FormEditorProps) {
    const [orderedProducts, setOrderedProducts] = useState<Product[]>(products);
    const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
    const dragOverIndex = useRef<number | null>(null);

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const handleDragStart = (index: number) => {
        setDraggedIndex(index);
    };

    const handleDragOver = (e: React.DragEvent, index: number) => {
        e.preventDefault();
        dragOverIndex.current = index;
    };

    const handleDragEnd = () => {
        if (draggedIndex !== null && dragOverIndex.current !== null && draggedIndex !== dragOverIndex.current) {
            const newOrder = [...orderedProducts];
            const [draggedItem] = newOrder.splice(draggedIndex, 1);
            newOrder.splice(dragOverIndex.current, 0, draggedItem);
            setOrderedProducts(newOrder);
        }
        setDraggedIndex(null);
        dragOverIndex.current = null;
    };

    const handleSave = () => {
        onSave(orderedProducts);
    };

    return (
        <div className="modal-overlay" onClick={onCancel}>
            <div className="modal" style={{ maxWidth: '900px', width: '95%' }} onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h3 className="modal-title">📝 Edit Form Layout</h3>
                    <button className="modal-close" onClick={onCancel}>×</button>
                </div>

                <p style={{ color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
                    Drag products to reorder them in the form. The preview shows how customers will see the form.
                </p>

                <div className="form-editor-container">
                    {/* Draggable Products Panel */}
                    <div className="form-editor-panel">
                        <h4>📦 Products (Drag to Reorder)</h4>
                        {orderedProducts.map((product, index) => (
                            <div
                                key={product.id}
                                className={`draggable-item ${draggedIndex === index ? 'dragging' : ''}`}
                                draggable
                                onDragStart={() => handleDragStart(index)}
                                onDragOver={(e) => handleDragOver(e, index)}
                                onDragEnd={handleDragEnd}
                            >
                                <span className="drag-handle">☰</span>
                                {product.image_url ? (
                                    <img
                                        src={product.image_url}
                                        alt={product.name}
                                        className="draggable-item-image"
                                    />
                                ) : (
                                    <div className="draggable-item-image" style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        fontSize: 'var(--text-lg)'
                                    }}>
                                        📦
                                    </div>
                                )}
                                <div className="draggable-item-content">
                                    <div className="draggable-item-name">{product.name}</div>
                                    <div className="draggable-item-price">{formatCurrency(product.price)}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Form Preview Panel */}
                    <div className="form-editor-panel">
                        <h4>👁️ Form Preview</h4>

                        {/* Static fields */}
                        <div className="form-preview-field static">
                            <label>Your Name *</label>
                            <input className="preview-input" placeholder="Enter your name" disabled />
                        </div>

                        <div className="form-preview-field static">
                            <label>Your Email *</label>
                            <input className="preview-input" placeholder="Enter your email" disabled />
                        </div>

                        <div style={{
                            borderTop: '1px dashed var(--color-border)',
                            margin: 'var(--space-md) 0',
                            paddingTop: 'var(--space-md)'
                        }}>
                            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-muted)' }}>
                                Product Quantities:
                            </span>
                        </div>

                        {/* Dynamic product fields */}
                        {orderedProducts.map((product, index) => (
                            <div key={product.id} className="form-preview-field">
                                <label>
                                    {index + 1}. {product.name} ({formatCurrency(product.price)})
                                </label>
                                <input
                                    className="preview-input"
                                    type="number"
                                    placeholder="0"
                                    disabled
                                    style={{ width: '100px' }}
                                />
                            </div>
                        ))}
                    </div>
                </div>

                <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-xl)' }}>
                    <button className="btn btn-secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button className="btn btn-primary" onClick={handleSave}>
                        ✓ Apply Layout
                    </button>
                </div>
            </div>
        </div>
    );
}
