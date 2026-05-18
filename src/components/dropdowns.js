// ============================================================
// SISTEMA DE CONTROLES Y DROPDOWNS ESTILO HIGGSFIELD
// Importar y usar en ImageStudio.js y VideoStudio.js
// ============================================================

// -------------------------------------------------------
// createControlBtn — botón pill estilo Higgsfield
// -------------------------------------------------------
export function createControlBtn(icon, label, id) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.id = id;
    btn.style.cssText = `
        display:flex;align-items:center;gap:6px;
        padding:8px 14px;
        background:#1a1a1a;
        border:1px solid #2a2a2a;
        border-radius:100px;
        cursor:pointer;
        color:#fff;
        font-size:12px;
        font-weight:600;
        white-space:nowrap;
        transition:background .15s,border-color .15s;
        flex-shrink:0;
        user-select:none;
        -webkit-tap-highlight-color:transparent;
    `;
    btn.innerHTML = `
        ${icon}
        <span id="${id}-label" style="color:#fff">${label}</span>
        <svg style="opacity:.3;flex-shrink:0" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M6 9l6 6 6-6"/></svg>
    `;
    btn.addEventListener('mouseenter', () => { btn.style.background = '#222'; btn.style.borderColor = '#3a3a3a'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = '#1a1a1a'; btn.style.borderColor = '#2a2a2a'; });
    return btn;
}

// -------------------------------------------------------
// createDropdownSystem — dropdown desktop + bottom sheet mobile
// -------------------------------------------------------
export function createDropdownSystem() {
    // Overlay para bottom sheet mobile
    const overlay = document.createElement('div');
    overlay.style.cssText = `
        display:none;position:fixed;inset:0;
        background:rgba(0,0,0,.6);
        z-index:999998;
        backdrop-filter:blur(4px);
        -webkit-backdrop-filter:blur(4px);
    `;
    document.body.appendChild(overlay);

    // Panel desktop (flotante)
    const desktopPanel = document.createElement('div');
    desktopPanel.style.cssText = `
        display:none;position:fixed;
        background:#161616;
        border:1px solid #2a2a2a;
        border-radius:16px;
        overflow:hidden;
        z-index:999999;
        min-width:240px;
        box-shadow:0 20px 60px rgba(0,0,0,.8);
    `;
    document.body.appendChild(desktopPanel);

    // Panel mobile (bottom sheet)
    const mobilePanel = document.createElement('div');
    mobilePanel.style.cssText = `
        display:none;position:fixed;
        bottom:0;left:0;right:0;
        background:#161616;
        border-radius:20px 20px 0 0;
        border-top:1px solid #2a2a2a;
        z-index:999999;
        max-height:80vh;
        overflow-y:auto;
        transform:translateY(100%);
        transition:transform .3s cubic-bezier(.32,.72,0,1);
        padding-bottom:env(safe-area-inset-bottom,16px);
    `;
    document.body.appendChild(mobilePanel);

    let isOpen = false;
    const isMobile = () => window.innerWidth < 768;

    const close = () => {
        if (!isOpen) return;
        isOpen = false;
        overlay.style.display = 'none';
        if (isMobile()) {
            mobilePanel.style.transform = 'translateY(100%)';
            setTimeout(() => { mobilePanel.style.display = 'none'; mobilePanel.innerHTML = ''; }, 300);
        } else {
            desktopPanel.style.display = 'none';
            desktopPanel.innerHTML = '';
        }
    };

    const open = (content, anchorBtn, widthPx = 280) => {
        isOpen = true;
        if (isMobile()) {
            // Bottom sheet
            mobilePanel.innerHTML = `
                <div style="width:36px;height:4px;background:#333;border-radius:2px;margin:12px auto"></div>
                ${content}
            `;
            mobilePanel.style.display = 'block';
            overlay.style.display = 'block';
            requestAnimationFrame(() => { mobilePanel.style.transform = 'translateY(0)'; });
        } else {
            // Dropdown flotante
            desktopPanel.innerHTML = content;
            desktopPanel.style.display = 'block';
            desktopPanel.style.width = widthPx + 'px';
            overlay.style.display = 'none';

            const rect = anchorBtn.getBoundingClientRect();
            const panelH = desktopPanel.offsetHeight || 300;
            const spaceBelow = window.innerHeight - rect.bottom - 8;

            if (spaceBelow >= panelH) {
                desktopPanel.style.top  = `${rect.bottom + 6}px`;
                desktopPanel.style.bottom = 'auto';
            } else {
                desktopPanel.style.bottom = `${window.innerHeight - rect.top + 6}px`;
                desktopPanel.style.top = 'auto';
            }

            let left = rect.left;
            if (left + widthPx > window.innerWidth - 8) left = window.innerWidth - widthPx - 8;
            desktopPanel.style.left = `${Math.max(8, left)}px`;
        }
    };

    overlay.addEventListener('click', close);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
    document.addEventListener('click', (e) => {
        if (!isOpen) return;
        if (!desktopPanel.contains(e.target) && !mobilePanel.contains(e.target)) close();
    });

    // -------------------------------------------------------
    // buildModelContent — contenido del dropdown de modelos
    // -------------------------------------------------------
    const buildModelContent = (models, selectedId, onSelect) => {
        const colorMap = {
            0: '#f59e0b', 1: '#60a5fa', 2: '#a78bfa', 3: '#34d399', 4: '#f87171'
        };
        let items = models.map((m, i) => {
            const initials = m.name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
            const color    = colorMap[i % 5];
            const isActive = m.id === selectedId || m.uiId === selectedId;
            return `
                <div class="dd-item" data-id="${m.id || m.uiId}" style="
                    display:flex;align-items:center;justify-content:space-between;
                    padding:12px 16px;cursor:pointer;
                    background:${isActive ? '#1c1c1c' : 'transparent'};
                    border-bottom:1px solid #1a1a1a;
                    transition:background .1s;
                ">
                    <div style="display:flex;align-items:center;gap:10px">
                        <div style="width:34px;height:34px;background:#1f1f1f;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:800;color:${color};flex-shrink:0">${initials}</div>
                        <div>
                            <div style="color:#fff;font-size:13px;font-weight:600;line-height:1.2">${m.name}</div>
                            ${m.desc ? `<div style="color:#555;font-size:11px;margin-top:2px">${m.desc}</div>` : ''}
                        </div>
                    </div>
                    ${isActive ? `<svg style="color:#f59e0b;flex-shrink:0" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div style="padding:12px 16px;border-bottom:1px solid #1f1f1f;color:#555;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">Modelos KreateIA</div>
            ${items}
        `;
    };

    // -------------------------------------------------------
    // buildListContent — dropdown de lista simple (AR, duración, calidad)
    // -------------------------------------------------------
    const buildListContent = (title, items, selectedVal) => {
        const rows = items.map(item => {
            const val   = typeof item === 'object' ? item.id   : item;
            const label = typeof item === 'object' ? item.name : item;
            const isActive = String(val) === String(selectedVal);
            return `
                <div class="dd-item" data-val="${val}" style="
                    display:flex;align-items:center;justify-content:space-between;
                    padding:12px 16px;cursor:pointer;
                    background:${isActive ? '#1c1c1c' : 'transparent'};
                    border-bottom:1px solid #1a1a1a;
                    transition:background .1s;
                ">
                    <span style="color:#fff;font-size:13px;font-weight:600">${label}</span>
                    ${isActive ? `<svg style="color:#f59e0b" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div style="padding:12px 16px;border-bottom:1px solid #1f1f1f;color:#555;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">${title}</div>
            ${rows}
        `;
    };

    // -------------------------------------------------------
    // buildGridContent — bottom sheet con grid 2 col (para AR en mobile)
    // -------------------------------------------------------
    const buildGridContent = (title, items, selectedVal) => {
        const cells = items.map(item => {
            const val   = typeof item === 'object' ? item.id   : item;
            const label = typeof item === 'object' ? item.name : item;
            const sub   = typeof item === 'object' ? item.sub  : null;
            const isActive = String(val) === String(selectedVal);
            return `
                <div class="dd-item" data-val="${val}" style="
                    background:${isActive ? '#1f1f1f' : '#1a1a1a'};
                    border:${isActive ? '2px solid #f59e0b' : '1px solid #2a2a2a'};
                    border-radius:12px;padding:14px 10px;text-align:center;cursor:pointer;
                    transition:border-color .15s;
                ">
                    <div style="color:#fff;font-size:13px;font-weight:700">${label}</div>
                    ${sub ? `<div style="color:#555;font-size:10px;margin-top:2px">${sub}</div>` : ''}
                </div>
            `;
        }).join('');

        return `
            <div style="padding:0 16px 16px">
                <div style="padding:4px 0 14px;color:#555;font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase">${title}</div>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${cells}</div>
            </div>
        `;
    };

    // -------------------------------------------------------
    // Agregar hover a items tras insertar en DOM
    // -------------------------------------------------------
    const attachItemHovers = (panel) => {
        panel.querySelectorAll('.dd-item').forEach(item => {
            item.addEventListener('mouseenter', () => { if (!item.style.border?.includes('2px')) item.style.background = '#1f1f1f'; });
            item.addEventListener('mouseleave', () => {
                const isActive = item.querySelector('svg[style*="f59e0b"]');
                item.style.background = isActive ? '#1c1c1c' : 'transparent';
            });
        });
    };

    // -------------------------------------------------------
    // openModels
    // -------------------------------------------------------
    const openModels = (models, selectedId, anchorBtn, onSelect) => {
        const content = buildModelContent(models, selectedId, onSelect);
        open(content, anchorBtn, 300);
        const panel = isMobile() ? mobilePanel : desktopPanel;
        attachItemHovers(panel);
        panel.querySelectorAll('.dd-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const id = item.dataset.id;
                close();
                onSelect(id);
            });
        });
    };

    // -------------------------------------------------------
    // openList
    // -------------------------------------------------------
    const openList = (title, items, selectedVal, anchorBtn, onSelect, useGrid = false) => {
        const content = (useGrid || isMobile())
            ? buildGridContent(title, items, selectedVal)
            : buildListContent(title, items, selectedVal);
        open(content, anchorBtn, 220);
        const panel = isMobile() ? mobilePanel : desktopPanel;
        attachItemHovers(panel);
        panel.querySelectorAll('.dd-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.stopPropagation();
                const val = item.dataset.val;
                close();
                onSelect(val);
            });
        });
    };

    return { openModels, openList, close, isOpen: () => isOpen };
}
