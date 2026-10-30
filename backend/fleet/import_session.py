import uuid


_pending_imports = {}


def create_import_session(records, mappings, filename):
    session_id = str(uuid.uuid4())

    _pending_imports[session_id] = {
        "filename": filename,
        "records": records,
        "mappings": mappings,
    }

    return session_id


def get_import_session(session_id):
    return _pending_imports.get(session_id)


def delete_import_session(session_id):
    _pending_imports.pop(
        session_id,
        None,
    )