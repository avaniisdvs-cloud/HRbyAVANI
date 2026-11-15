/**
 * Universal @react-pdf/renderer Document for employee letters.
 * Supports language: 'en' | 'ar' | 'both'
 *   'en'   — single English page
 *   'ar'   — single Arabic page (RTL layout)
 *   'both' — English page followed by Arabic page
 */
import {
  Document, Page, Text, View, Image, StyleSheet,
} from '@react-pdf/renderer'

function parseBody(html: string): Array<{ text: string; bold: boolean }> {
  const paragraphs: Array<{ text: string; bold: boolean }> = []
  const pMatches = html.match(/<p[^>]*>([\s\S]*?)<\/p>/gi) ?? [html]
  for (const p of pMatches) {
    const inner = p.replace(/<p[^>]*>/i, '').replace(/<\/p>/i, '')
    const parts = inner.split(/(<strong>[\s\S]*?<\/strong>)/gi)
    for (const part of parts) {
      const boldMatch = part.match(/^<strong>([\s\S]*?)<\/strong>$/i)
      const text = (boldMatch ? boldMatch[1] : part)
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]+>/g, '')
        .trim()
      if (text) paragraphs.push({ text, bold: !!boldMatch })
    }
    paragraphs.push({ text: '', bold: false })
  }
  return paragraphs
}

const styles = StyleSheet.create({
  page: {
    paddingTop: 60, paddingBottom: 80, paddingHorizontal: 60,
    fontFamily: 'Helvetica', fontSize: 11, color: '#1a1a1a',
    lineHeight: 1.6,
  },
  header: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 28,
  },
  headerAr: {
    flexDirection: 'row-reverse', justifyContent: 'space-between',
    alignItems: 'flex-start', marginBottom: 28,
  },
  logo: { width: 120, height: 48, objectFit: 'contain' },
  letterMeta: { fontSize: 10, color: '#555', textAlign: 'right' },
  letterMetaAr: { fontSize: 10, color: '#555', textAlign: 'left' },
  divider: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', marginBottom: 20 },
  paragraph: { marginBottom: 8 },
  paragraphAr: { marginBottom: 8, textAlign: 'right' },
  bold: { fontFamily: 'Helvetica-Bold' },
  spacer: { marginBottom: 6 },
  sigBlock: { marginTop: 32 },
  sigBlockAr: { marginTop: 32, alignItems: 'flex-end' },
  footer: {
    position: 'absolute', bottom: 0, left: 60, right: 60,
    borderTopWidth: 1, borderTopColor: '#e5e7eb',
    paddingTop: 8, fontSize: 9, color: '#aaa', textAlign: 'center',
  },
  footerImage: {
    position: 'absolute', bottom: 0, left: 60, right: 60,
    height: 60, objectFit: 'contain',
  },
  langBadge: {
    fontSize: 8, color: '#6B7280',
    borderWidth: 1, borderColor: '#E5E7EB',
    padding: '2 6', borderRadius: 3, marginBottom: 12,
    alignSelf: 'flex-start',
  },
  langBadgeAr: {
    fontSize: 8, color: '#6B7280',
    borderWidth: 1, borderColor: '#E5E7EB',
    padding: '2 6', borderRadius: 3, marginBottom: 12,
    alignSelf: 'flex-end',
  },
})

interface Props {
  letterNumber:           string
  letterDate:             string
  resolvedBodyEn:         string
  resolvedBodyAr?:        string
  language:               'en' | 'ar' | 'both'
  companyNameEn:          string
  companyNameAr?:         string
  primaryLogoUrl?:        string
  footerImageUrl?:        string
  signatoryName?:         string
  signatoryTitle?:        string
  signatorySignatureUrl?: string
}

function EnPage(props: Props) {
  const { letterNumber, letterDate, resolvedBodyEn, companyNameEn,
    primaryLogoUrl, footerImageUrl, signatoryName, signatoryTitle, signatorySignatureUrl, language } = props
  const paragraphs = parseBody(resolvedBodyEn)

  return (
    <Page size="A4" style={styles.page}>
      {language === 'both' && (
        <Text style={styles.langBadge}>English</Text>
      )}
      <View style={styles.header}>
        {primaryLogoUrl
          ? <Image src={primaryLogoUrl} style={styles.logo} />
          : <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14 }}>{companyNameEn}</Text>}
        <View style={styles.letterMeta}>
          <Text>Ref: {letterNumber}</Text>
          <Text>Date: {letterDate}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      {paragraphs.map((p, i) =>
        p.text
          ? <Text key={i} style={[styles.paragraph, p.bold ? styles.bold : {}]}>{p.text}</Text>
          : <View key={i} style={styles.spacer} />
      )}

      {signatoryName && (
        <View style={styles.sigBlock}>
          {signatorySignatureUrl && (
            <Image src={signatorySignatureUrl}
              style={{ width: 180, height: 64, objectFit: 'contain', marginBottom: 6 }} />
          )}
          <Text style={styles.bold}>{signatoryName}</Text>
          {signatoryTitle && <Text style={{ fontSize: 10, color: '#555' }}>{signatoryTitle}</Text>}
          <Text style={{ fontSize: 10, color: '#555' }}>{companyNameEn}</Text>
        </View>
      )}
      {footerImageUrl
        ? <Image src={footerImageUrl} style={styles.footerImage} />
        : <Text style={styles.footer}>{companyNameEn} — {letterNumber}</Text>}
    </Page>
  )
}

function ArPage(props: Props) {
  const { letterNumber, letterDate, resolvedBodyAr, companyNameEn, companyNameAr,
    primaryLogoUrl, footerImageUrl, signatoryName, signatoryTitle, signatorySignatureUrl, language } = props
  if (!resolvedBodyAr) return null
  const paragraphs = parseBody(resolvedBodyAr)
  const companyLabel = companyNameAr ?? companyNameEn

  return (
    <Page size="A4" style={styles.page}>
      {language === 'both' && (
        <Text style={styles.langBadgeAr}>العربية</Text>
      )}
      <View style={styles.headerAr}>
        {primaryLogoUrl
          ? <Image src={primaryLogoUrl} style={styles.logo} />
          : <Text style={{ fontFamily: 'Helvetica-Bold', fontSize: 14 }}>{companyLabel}</Text>}
        <View style={styles.letterMetaAr}>
          <Text>المرجع: {letterNumber}</Text>
          <Text>التاريخ: {letterDate}</Text>
        </View>
      </View>
      <View style={styles.divider} />

      {paragraphs.map((p, i) =>
        p.text
          ? <Text key={i} style={[styles.paragraphAr, p.bold ? styles.bold : {}]}>{p.text}</Text>
          : <View key={i} style={styles.spacer} />
      )}

      {signatoryName && (
        <View style={styles.sigBlockAr}>
          {signatorySignatureUrl && (
            <Image src={signatorySignatureUrl}
              style={{ width: 180, height: 64, objectFit: 'contain', marginBottom: 6 }} />
          )}
          <Text style={[styles.bold, { textAlign: 'right' }]}>{signatoryName}</Text>
          {signatoryTitle && <Text style={{ fontSize: 10, color: '#555', textAlign: 'right' }}>{signatoryTitle}</Text>}
          <Text style={{ fontSize: 10, color: '#555', textAlign: 'right' }}>{companyLabel}</Text>
        </View>
      )}
      {footerImageUrl
        ? <Image src={footerImageUrl} style={styles.footerImage} />
        : <Text style={styles.footer}>{companyLabel} — {letterNumber}</Text>}
    </Page>
  )
}

export function LetterPdf(props: Props) {
  const { language } = props
  return (
    <Document>
      {(language === 'en' || language === 'both') && <EnPage {...props} />}
      {(language === 'ar' || language === 'both') && props.resolvedBodyAr && <ArPage {...props} />}
    </Document>
  )
}
