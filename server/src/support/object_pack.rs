use worker::Error;

const MAGIC: &[u8; 4] = b"PIGP";
const TRAILER: &[u8; 4] = b"PIGZ";
const VERSION: u8 = 1;
const FLAG_GZIP: u8 = 1;
const MAX_KIND_LEN: usize = 16;
const MAX_OBJECT_SIZE: usize = 64 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PackObject {
    pub id: String,
    pub kind: String,
    pub bytes: Vec<u8>,
}

pub fn encode_pack(objects: &[PackObject], gzip: bool) -> Result<Vec<u8>, Error> {
    let mut records = Vec::new();
    for object in objects {
        let id_bytes = hex::decode(&object.id)
            .map_err(|error| Error::RustError(format!("invalid object id {}: {error}", object.id)))?;
        if id_bytes.len() != 32 {
            return Err(Error::RustError(format!(
                "object id {} must decode to 32 bytes",
                object.id
            )));
        }
        if object.kind.len() > MAX_KIND_LEN {
            return Err(Error::RustError(format!(
                "object kind {} is too long",
                object.kind
            )));
        }
        if object.bytes.len() > MAX_OBJECT_SIZE {
            return Err(Error::RustError(format!(
                "object {} exceeds pack size limit",
                object.id
            )));
        }
        records.extend_from_slice(&id_bytes);
        records.push(object.kind.len() as u8);
        records.extend_from_slice(object.kind.as_bytes());
        let size = u32::try_from(object.bytes.len()).map_err(|_| {
            Error::RustError(format!("object {} is too large for pack format", object.id))
        })?;
        records.extend_from_slice(&size.to_le_bytes());
        records.extend_from_slice(&object.bytes);
    }

    let payload = if gzip {
        let mut encoder = flate2::write::GzEncoder::new(Vec::new(), flate2::Compression::fast());
        std::io::Write::write_all(&mut encoder, &records)
            .map_err(|error| Error::RustError(error.to_string()))?;
        encoder
            .finish()
            .map_err(|error| Error::RustError(error.to_string()))?
    } else {
        records
    };

    let mut out = Vec::with_capacity(8 + payload.len() + 4);
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.push(if gzip { FLAG_GZIP } else { 0 });
    out.extend_from_slice(&0u16.to_le_bytes());
    out.extend_from_slice(&payload);
    out.extend_from_slice(TRAILER);
    Ok(out)
}

pub fn decode_pack(input: &[u8]) -> Result<Vec<PackObject>, Error> {
    if input.len() < 12 {
        return Err(Error::RustError("pack payload is too short".to_string()));
    }
    if &input[..4] != MAGIC {
        return Err(Error::RustError("invalid pack magic".to_string()));
    }
    if input[4] != VERSION {
        return Err(Error::RustError(format!(
            "unsupported pack version {}",
            input[4]
        )));
    }
    let flags = input[5];
    if input[input.len() - 4..] != *TRAILER {
        return Err(Error::RustError("invalid pack trailer".to_string()));
    }
    let payload = &input[8..input.len() - 4];
    let records = if flags & FLAG_GZIP != 0 {
        let mut decoder = flate2::read::GzDecoder::new(payload);
        let mut decompressed = Vec::new();
        std::io::Read::read_to_end(&mut decoder, &mut decompressed)
            .map_err(|error| Error::RustError(error.to_string()))?;
        decompressed
    } else {
        payload.to_vec()
    };

    let mut objects = Vec::new();
    let mut offset = 0usize;
    while offset < records.len() {
        if offset + 32 + 1 + 4 > records.len() {
            return Err(Error::RustError("truncated pack record".to_string()));
        }
        let id = hex::encode(&records[offset..offset + 32]);
        offset += 32;
        let kind_len = usize::from(records[offset]);
        offset += 1;
        if kind_len > MAX_KIND_LEN || offset + kind_len + 4 > records.len() {
            return Err(Error::RustError("invalid pack kind length".to_string()));
        }
        let kind = std::str::from_utf8(&records[offset..offset + kind_len])
            .map_err(|error| Error::RustError(error.to_string()))?
            .to_string();
        offset += kind_len;
        let size = u32::from_le_bytes(
            records[offset..offset + 4]
                .try_into()
                .expect("size bytes"),
        ) as usize;
        offset += 4;
        if offset + size > records.len() {
            return Err(Error::RustError(format!(
                "truncated pack object bytes for {id}"
            )));
        }
        let bytes = records[offset..offset + size].to_vec();
        offset += size;
        objects.push(PackObject { id, kind, bytes });
    }
    Ok(objects)
}
