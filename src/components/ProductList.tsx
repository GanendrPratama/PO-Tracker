import { useState, useRef } from 'react';
import { useProducts } from '../hooks/useDatabase';
import { Product } from '../types';

export function ProductList() {
    const { products, loading, addProduct, updateProduct, deleteProduct } = useProducts();
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [formData, setFormData] = useState({ name: '', description: '', price: '', image_url: '' });
    const [imagePreview, setImagePreview] = useState<string | null>(null);
    const [dragOver, setDragOver] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
    const [deleting, setDeleting] = useState(false);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const price = parseFloat(formData.price);

        if (editingProduct && editingProduct.id) {
            await updateProduct(editingProduct.id, {
                name: formData.name,
                description: formData.description,
                price,
                image_url: formData.image_url || undefined
            });
        } else {
            await addProduct({
                name: formData.name,
                description: formData.description,
                price,
                image_url: formData.image_url || undefined
            });
        }

        closeModal();
    };

    const openAddModal = () => {
        setEditingProduct(null);
        setFormData({ name: '', description: '', price: '', image_url: '' });
        setImagePreview(null);
        setShowModal(true);
    };

    const openEditModal = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || '',
            price: product.price.toString(),
            image_url: product.image_url || ''
        });
        setImagePreview(product.image_url || null);
        setShowModal(true);
    };

    const closeModal = () => {
        setShowModal(false);
        setEditingProduct(null);
        setFormData({ name: '', description: '', price: '', image_url: '' });
        setImagePreview(null);
    };

    const handleDelete = async (id: number) => {
        setDeleting(true);
        try {
            await deleteProduct(id);
        } finally {
            setDeleting(false);
            setDeleteConfirmId(null);
        }
    };

    const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    };

    const handleImageUrlChange = (url: string) => {
        setFormData({ ...formData, image_url: url });
        setImagePreview(url);
    };

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setDragOver(false);

        const file = e.dataTransfer.files[0];
        if (file && file.type.startsWith('image/')) {
            convertFileToDataUrl(file);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file && file.type.startsWith('image/')) {
            convertFileToDataUrl(file);
        }
    };

    const convertFileToDataUrl = (file: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const dataUrl = e.target?.result as string;
            setFormData({ ...formData, image_url: dataUrl });
            setImagePreview(dataUrl);
        };
        reader.readAsDataURL(file);
    };

    const clearImage = () => {
        setFormData({ ...formData, image_url: '' });
        setImagePreview(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    if (loading) {
        return (
            <div className="loading">
                <div className="spinner"></div>
            </div>
        );
    }

    return (
        <div>
            <div className="page-header">
                <h1 className="page-title">Products</h1>
                <p className="page-subtitle">Manage your product catalog</p>
            </div>

            <div className="card">
                <div className="card-header">
                    <h2 className="card-title">All Products</h2>
                    <button className="btn btn-primary" onClick={openAddModal}>
                        ➕ Add Product
                    </button>
                </div>

                {products.length === 0 ? (
                    <div className="empty-state">
                        <div className="empty-icon">📦</div>
                        <p>No products yet. Add your first product!</p>
                    </div>
                ) : (
                    <div className="product-grid">
                        {products.map((product) => (
                            <div key={product.id} className="product-card">
                                <div className="product-card-image">
                                    {product.image_url ? (
                                        <img
                                            src={product.image_url}
                                            alt={product.name}
                                            onError={(e) => {
                                                (e.target as HTMLImageElement).style.display = 'none';
                                                (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                                            }}
                                        />
                                    ) : null}
                                    <div className={`product-card-placeholder ${product.image_url ? 'hidden' : ''}`}>
                                        📦
                                    </div>
                                </div>
                                <div className="product-card-content">
                                    <h3 className="product-card-name">{product.name}</h3>
                                    {product.description && (
                                        <p className="product-card-description">{product.description}</p>
                                    )}
                                    <div className="product-card-price">{formatCurrency(product.price)}</div>
                                </div>
                                <div className="product-card-actions">
                                    <button
                                        className="btn btn-icon"
                                        onClick={() => openEditModal(product)}
                                        title="Edit"
                                    >
                                        ✏️
                                    </button>
                                    <button
                                        className="btn btn-icon"
                                        onClick={() => product.id && setDeleteConfirmId(product.id)}
                                        title="Delete"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {showModal && (
                <div className="modal-overlay" onClick={closeModal}>
                    <div className="modal modal-lg" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h3 className="modal-title">
                                {editingProduct ? 'Edit Product' : 'Add Product'}
                            </h3>
                            <button className="modal-close" onClick={closeModal}>×</button>
                        </div>

                        <form onSubmit={handleSubmit}>
                            {/* Image Upload Section */}
                            <div className="form-group">
                                <label className="form-label">Product Image</label>
                                <div
                                    className={`image-upload-area ${dragOver ? 'drag-over' : ''}`}
                                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                                    onDragLeave={() => setDragOver(false)}
                                    onDrop={handleFileDrop}
                                    onClick={() => fileInputRef.current?.click()}
                                >
                                    {imagePreview ? (
                                        <div className="image-preview-container">
                                            <img src={imagePreview} alt="Preview" className="image-preview" />
                                            <button
                                                type="button"
                                                className="image-remove-btn"
                                                onClick={(e) => { e.stopPropagation(); clearImage(); }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <div className="image-upload-placeholder">
                                            <span className="upload-icon">📷</span>
                                            <p>Drag & drop an image here</p>
                                            <p className="upload-hint">or click to browse</p>
                                        </div>
                                    )}
                                </div>
                                <input
                                    ref={fileInputRef}
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileSelect}
                                    style={{ display: 'none' }}
                                />

                                <div style={{ marginTop: 'var(--space-sm)' }}>
                                    <label className="form-label" style={{ fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)' }}>
                                        Or paste image URL:
                                    </label>
                                    <input
                                        type="url"
                                        className="form-input"
                                        value={formData.image_url.startsWith('data:') ? '' : formData.image_url}
                                        onChange={(e) => handleImageUrlChange(e.target.value)}
                                        placeholder="https://example.com/image.jpg"
                                    />
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Product Name *</label>
                                <input
                                    type="text"
                                    className="form-input"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="Enter product name"
                                    required
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Description</label>
                                <textarea
                                    className="form-textarea"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="Enter product description"
                                />
                            </div>

                            <div className="form-group">
                                <label className="form-label">Price *</label>
                                <input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    className="form-input"
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                                    placeholder="0.00"
                                    required
                                />
                            </div>

                            <div className="btn-group" style={{ justifyContent: 'flex-end', marginTop: 'var(--space-lg)' }}>
                                <button type="button" className="btn btn-secondary" onClick={closeModal}>
                                    Cancel
                                </button>
                                <button type="submit" className="btn btn-primary">
                                    {editingProduct ? 'Save Changes' : 'Add Product'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId != null && (
                <div className="modal-overlay" onClick={() => setDeleteConfirmId(null)}>
                    <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '400px' }}>
                        <div className="modal-header">
                            <h3 className="modal-title">⚠️ Delete Product</h3>
                            <button className="modal-close" onClick={() => setDeleteConfirmId(null)}>×</button>
                        </div>
                        <p style={{ marginBottom: 'var(--space-lg)', color: 'var(--color-text-secondary)' }}>
                            Are you sure you want to delete this product? This action cannot be undone.
                        </p>
                        <div className="btn-group" style={{ justifyContent: 'flex-end' }}>
                            <button className="btn btn-secondary" onClick={() => setDeleteConfirmId(null)} disabled={deleting}>
                                Cancel
                            </button>
                            <button className="btn btn-danger" onClick={() => handleDelete(deleteConfirmId)} disabled={deleting}>
                                {deleting ? '⏳ Deleting...' : '🗑️ Delete'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
