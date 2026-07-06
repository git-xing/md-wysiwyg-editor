import "./pictureEditor.css";
import type { Node } from "@milkdown/prose/model";
import type { EditorView } from "@milkdown/prose/view";
import { t } from "@/i18n";
import { IconPencil, IconTrash2 } from "@/ui/icons";

interface SourceEntry {
    srcset: string;
    media: string;
    type: string;
}

interface PictureData {
    sources: SourceEntry[];
    src: string;
    alt: string;
}

function parsePictureNode(node: Node): PictureData {
    const sources: SourceEntry[] = [];
    let src = "";
    let alt = "";

    for (let i = 0; i < node.childCount; i++) {
        const child = node.child(i);
        if (child.type.name === "source") {
            sources.push({
                srcset: child.attrs["srcset"] || "",
                media: child.attrs["media"] || "",
                type: child.attrs["type"] || "",
            });
        } else if (child.type.name === "image") {
            src = child.attrs["src"] || "";
            alt = child.attrs["alt"] || "";
        }
    }

    return { sources, src, alt };
}

export function createPictureView(
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
): { dom: HTMLElement; update: (node: Node) => boolean } {
    const wrapper = document.createElement("span");
    wrapper.className = "picture-view";
    wrapper.contentEditable = "false";

    const pictureEl = document.createElement("picture");
    pictureEl.className = "picture-view-content";

    const toolbar = document.createElement("div");
    toolbar.className = "picture-view-toolbar";

    function renderPicture(data: PictureData): void {
        pictureEl.innerHTML = "";
        for (const s of data.sources) {
            const source = document.createElement("source");
            if (s.srcset) source.srcset = s.srcset;
            if (s.media) source.media = s.media;
            if (s.type) source.type = s.type;
            pictureEl.appendChild(source);
        }
        const img = document.createElement("img");
        img.src = data.src;
        img.alt = data.alt;
        img.draggable = false;
        pictureEl.appendChild(img);
    }

    function buildToolbar(): void {
        toolbar.innerHTML = "";
        const editBtn = document.createElement("button");
        editBtn.className = "picture-view-btn";
        editBtn.innerHTML = IconPencil;
        editBtn.setAttribute("aria-label", t("Edit"));
        editBtn.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            showEditPanel(node, view, getPos, wrapper);
        });
        toolbar.appendChild(editBtn);
    }

    const data = parsePictureNode(node);
    renderPicture(data);
    buildToolbar();
    wrapper.appendChild(pictureEl);
    wrapper.appendChild(toolbar);

    return {
        dom: wrapper,
        update(newNode: Node) {
            if (newNode.type.name !== "picture") return false;
            node = newNode;
            renderPicture(parsePictureNode(newNode));
            return true;
        },
    };
}

function showEditPanel(
    node: Node,
    view: EditorView,
    getPos: () => number | undefined,
    anchor: HTMLElement,
): void {
    document.querySelectorAll(".picture-edit-panel").forEach(el => el.remove());

    const data = parsePictureNode(node);
    const panel = document.createElement("div");
    panel.className = "picture-edit-panel";

    const title = document.createElement("div");
    title.className = "picture-edit-title";
    title.textContent = t("Edit Picture");

    const closeBtn = document.createElement("button");
    closeBtn.className = "icon-btn picture-edit-close";
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => panel.remove());
    title.appendChild(closeBtn);
    panel.appendChild(title);

    const form = document.createElement("div");
    form.className = "picture-edit-form";

    function addSourceEntry(source?: SourceEntry): void {
        const row = document.createElement("div");
        row.className = "picture-edit-source-row";

        const srcsetInput = document.createElement("input");
        srcsetInput.className = "picture-edit-input";
        srcsetInput.placeholder = "srcset";
        srcsetInput.value = source?.srcset || "";

        const mediaInput = document.createElement("input");
        mediaInput.className = "picture-edit-input";
        mediaInput.placeholder = "media";
        mediaInput.value = source?.media || "";

        const typeInput = document.createElement("input");
        typeInput.className = "picture-edit-input";
        typeInput.placeholder = "type";
        typeInput.value = source?.type || "";

        const removeBtn = document.createElement("button");
        removeBtn.className = "icon-btn picture-edit-remove-btn";
        removeBtn.innerHTML = IconTrash2;
        removeBtn.addEventListener("click", () => row.remove());

        row.appendChild(srcsetInput);
        row.appendChild(mediaInput);
        row.appendChild(typeInput);
        row.appendChild(removeBtn);
        form.appendChild(row);
    }

    const sourceLabel = document.createElement("div");
    sourceLabel.className = "picture-edit-label";
    sourceLabel.textContent = "<source>";
    form.appendChild(sourceLabel);

    for (const s of data.sources) {
        addSourceEntry(s);
    }

    const addSourceBtn = document.createElement("button");
    addSourceBtn.className = "picture-edit-add-btn";
    addSourceBtn.textContent = "+ source";
    addSourceBtn.addEventListener("click", () => addSourceEntry());
    form.appendChild(addSourceBtn);

    const imgLabel = document.createElement("div");
    imgLabel.className = "picture-edit-label";
    imgLabel.textContent = "<img>";
    form.appendChild(imgLabel);

    const srcInput = document.createElement("input");
    srcInput.className = "picture-edit-input picture-edit-input--wide";
    srcInput.placeholder = "src";
    srcInput.value = data.src;
    form.appendChild(srcInput);

    const altInput = document.createElement("input");
    altInput.className = "picture-edit-input picture-edit-input--wide";
    altInput.placeholder = "alt";
    altInput.value = data.alt;
    form.appendChild(altInput);

    panel.appendChild(form);

    const actions = document.createElement("div");
    actions.className = "picture-edit-actions";

    const saveBtn = document.createElement("button");
    saveBtn.className = "picture-edit-save";
    saveBtn.textContent = t("Save");
    saveBtn.addEventListener("click", () => {
        const sources: SourceEntry[] = [];
        form.querySelectorAll(".picture-edit-source-row").forEach(row => {
            const inputs = row.querySelectorAll("input");
            sources.push({
                srcset: (inputs[0] as HTMLInputElement).value,
                media: (inputs[1] as HTMLInputElement).value,
                type: (inputs[2] as HTMLInputElement).value,
            });
        });

        const pos = getPos();
        if (pos === undefined) return;

        const sourceNodes = sources
            .filter(s => s.srcset)
            .map(s => {
                const sourceType = view.state.schema.nodes["source"];
                return sourceType?.create({ srcset: s.srcset, media: s.media || undefined, type: s.type || undefined });
            })
            .filter(Boolean);

        const imgNode = view.state.schema.nodes["image"]?.create({ src: srcInput.value, alt: altInput.value });
        const pictureType = view.state.schema.nodes["picture"];
        if (!pictureType || !imgNode) return;

        const newPicture = pictureType.create({}, [...sourceNodes, imgNode]);
        const tr = view.state.tr.replaceWith(pos, pos + node.nodeSize, newPicture);
        view.dispatch(tr);
        panel.remove();
    });
    actions.appendChild(saveBtn);

    const cancelBtn = document.createElement("button");
    cancelBtn.className = "picture-edit-cancel";
    cancelBtn.textContent = t("Cancel");
    cancelBtn.addEventListener("click", () => panel.remove());
    actions.appendChild(cancelBtn);

    panel.appendChild(actions);

    const rect = anchor.getBoundingClientRect();
    panel.style.position = "fixed";
    panel.style.left = `${rect.left}px`;
    panel.style.top = `${rect.bottom + 8}px`;
    panel.style.zIndex = "10000";
    document.body.appendChild(panel);

    const close = (e: MouseEvent) => {
        if (!panel.contains(e.target as Node)) {
            panel.remove();
            document.removeEventListener("mousedown", close);
        }
    };
    setTimeout(() => document.addEventListener("mousedown", close), 0);
}
