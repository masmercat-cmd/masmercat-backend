# Configuración segura de S3 para MasMercat

MasMercat guarda dos clases de objetos en el mismo bucket:

- `lots/*`: fotografías públicas de los lotes.
- `certificates/*`: documentos privados, accesibles únicamente mediante el
  backend y enlaces firmados de cinco minutos.

## Política del bucket

Sustituye `masmercat-images` por el nombre real del bucket. Esta política solo
permite lectura pública de las fotografías y nunca de los certificados:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadLotImagesOnly",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::masmercat-images/lots/*"
    }
  ]
}
```

En **Bloquear acceso público**, conserva bloqueadas las ACL públicas. Para que
la política anterior funcione, AWS exige desactivar únicamente los bloqueos de
políticas públicas del bucket. No añadas `certificates/*` ni `*` como recurso
de lectura pública.

## Política del usuario de Render

Adjunta esta política al usuario IAM cuyas claves están configuradas en Render:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "UploadLotImages",
      "Effect": "Allow",
      "Action": ["s3:PutObject"],
      "Resource": "arn:aws:s3:::masmercat-images/lots/*"
    },
    {
      "Sid": "PrivateCertificates",
      "Effect": "Allow",
      "Action": ["s3:PutObject", "s3:GetObject"],
      "Resource": "arn:aws:s3:::masmercat-images/certificates/*"
    }
  ]
}
```

No concedas acceso a otros buckets. Las variables necesarias en Render son:

```text
AWS_REGION=eu-west-1
AWS_S3_BUCKET=masmercat-images
AWS_S3_PUBLIC_BASE_URL=https://masmercat-images.s3.eu-west-1.amazonaws.com
```

Las claves `AWS_ACCESS_KEY_ID` y `AWS_SECRET_ACCESS_KEY` se guardan como
secretos de Render; nunca se copian al repositorio, al navegador ni a la app.

## Comprobación antes de publicar

1. Sube una fotografía y confirma que su URL pública abre correctamente.
2. Sube un certificado y copia su clave `certificates/...`.
3. Comprueba en una ventana privada que su URL directa devuelve `AccessDenied`.
4. Comprueba desde la cuenta titular y desde administración que el enlace
   temporal permite descargarlo.
5. Comprueba que otro usuario autenticado no puede consultar ese certificado.

Si el paso 3 falla, no publiques la plataforma: revisa la política del bucket
y cualquier ACL heredada del objeto.
