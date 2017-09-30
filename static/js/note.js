const tags = {
    1: "<b>",
    2: "</b>",
    3: "<i>",
    4: "</i>",
    5: "<u>",
    6: "</u>",
    9: "<s>",
    10: "</s>"
};

let noteChangeDisabled = false;

let isNoteChanged = false;

function noteChanged() {
    if (noteChangeDisabled) {
        return;
    }

    isNoteChanged = true;
}

function saveNoteIfChanged(callback) {
    if (!isNoteChanged) {
        if (callback) {
            callback();
        }

        return;
    }

    const note = globalCurrentNote;

    updateNoteFromInputs(note);

    encryptNoteIfNecessary(note);

    saveNoteToServer(note, callback);
}

setInterval(saveNoteIfChanged, 5000);

$(document).ready(function() {
    $("#noteTitle").on('input', function() {
        noteChanged();
    });

    $('#noteDetail').summernote({
        airMode: true,
        height: 300,
        callbacks: {
            onChange: noteChanged
        }
    });

    // so that tab jumps from note title (which has tabindex 1)
    $(".note-editable").attr("tabindex", 2);
});

function html2notecase(contents, note) {
    note.formatting = [];
    note.links = [];
    note.images = [];

    note.detail.note_text = contents;

    if (!note.detail.encryption) {
        const linkRegexp = /<a[^>]+?href="[^"]*kapp#([A-Za-z0-9]{22})"[^>]*?>[^<]+?<\/a>/g;
        let match;

        while (match = linkRegexp.exec(contents)) {
            console.log("adding link for " + match[1]);

            note.links.push({
                note_id: note.detail.note_id,
                target_note_id: match[1]
            });
        }
    }
}

function updateNoteFromInputs(note) {
    let contents = $('#noteDetail').summernote('code');

    html2notecase(contents, note);

    let title = $('#noteTitle').val();

    getNodeByKey(note.detail.note_id).setTitle(title);

    note.detail.note_title = title;
}

function saveNoteToServer(note, callback) {
    $.ajax({
        url: baseApiUrl + 'notes/' + note.detail.note_id,
        type: 'PUT',
        data: JSON.stringify(note),
        contentType: "application/json",
        success: function () {
            isNoteChanged = false;

            message("Saved!");

            if (callback) {
                callback();
            }
        },
        error: function () {
            error("Error saving the note!");
        }
    });
}

let globalCurrentNote;

function createNewTopLevelNote() {
    let rootNode = globalTree.fancytree("getRootNode");

    createNote(rootNode, "root", "into");
}

let newNoteCreated = false;

function createNote(node, parentKey, target, encryption) {
    // if encryption isn't available (user didn't enter password yet), then note is created as unencrypted
    // but this is quite weird since user doesn't see where the note is being created so it shouldn't occur often
    if (!encryption || !isEncryptionAvailable()) {
        encryption = 0;
    }

    const newNoteName = "new note";
    const newNoteNameEncryptedIfNecessary = encryption > 0 ? encryptString(newNoteName) : newNoteName;

    $.ajax({
        url: baseApiUrl + 'notes/' + parentKey + '/children' ,
        type: 'POST',
        data: JSON.stringify({
            note_title: newNoteNameEncryptedIfNecessary,
            target: target,
            target_note_id: node.key,
            encryption: encryption
        }),
        contentType: "application/json",
        success: function(result) {
            const newNode = {
                title: newNoteName,
                key: result.note_id,
                note_id: result.note_id,
                encryption: encryption,
                extraClasses: encryption ? "encrypted" : ""
            };

            globalAllNoteIds.push(result.note_id);

            newNoteCreated = true;

            if (target === 'after') {
                node.appendSibling(newNode).setActive(true);
            }
            else {
                node.addChildren(newNode).setActive(true);

                node.folder = true;
                node.renderTitle();
            }

            message("Created!");
        }
    });
}

function setTreeBasedOnEncryption(note) {
    const node = getNodeByKey(note.detail.note_id);
    node.toggleClass("encrypted", note.detail.encryption > 0);
}

function setNoteBackgroundIfEncrypted(note) {
    if (note.detail.encryption > 0) {
        $(".note-editable").addClass("encrypted");
        $("#encryptButton").hide();
        $("#decryptButton").show();
    }
    else {
        $(".note-editable").removeClass("encrypted");
        $("#encryptButton").show();
        $("#decryptButton").hide();
    }

    setTreeBasedOnEncryption(note);
}

function loadNote(noteId) {
    $.get(baseApiUrl + 'notes/' + noteId).then(function(note) {
        globalCurrentNote = note;

        if (newNoteCreated) {
            newNoteCreated = false;

            $("#noteTitle").focus().select();
        }

        handleEncryption(note.detail.encryption > 0, false, () => {
            $("#noteDetailWrapper").show();

            // this may fal if the dialog has not been previously opened
            try {
                $("#encryptionPasswordDialog").dialog('close');
            }
            catch(e) {}

            $("#encryptionPassword").val('');

            decryptNoteIfNecessary(note);

            $("#noteTitle").val(note.detail.note_title);

            noteChangeDisabled = true;

            // Clear contents and remove all stored history. This is to prevent undo from going across notes
            $('#noteDetail').summernote('reset');

            $('#noteDetail').summernote('code', note.detail.note_text);

            document.location.hash = noteId;

            $(window).resize(); // to trigger resizing of editor

            addRecentNote(noteId, note.detail.note_id);

            noteChangeDisabled = false;

            setNoteBackgroundIfEncrypted(note);
        });
    });
}