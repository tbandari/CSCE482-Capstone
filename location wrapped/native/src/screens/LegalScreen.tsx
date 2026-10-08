import React from 'react';
import {Alert,Linking,Modal,ScrollView,Text,View,StyleSheet,SafeAreaView} from 'react-native';
import {PrimaryButton} from '../components/ui';
import {colors} from '../theme';
import {legal,SUPPORT_EMAIL,SUPPORT_SITE,LEGAL_UPDATED} from '../data/legal';
export function LegalScreen({page,onClose}:{page:'privacy'|'support'|null;onClose:()=>void}) {
 if(!page)return null;
 const content=legal[page];
 const open=async(url:string)=>{try{await Linking.openURL(url);}catch{Alert.alert('Could not open link',`Contact ${SUPPORT_EMAIL}, or open ${SUPPORT_SITE} in your browser.`);}};
 return <Modal visible animationType="slide" onRequestClose={onClose}><SafeAreaView style={s.root}>
  <View style={s.close}><PrimaryButton title="Back to settings" onPress={onClose} secondary /></View>
  <ScrollView contentContainerStyle={s.content}><Text style={s.title}>{content.title}</Text><Text style={s.body}>Updated {LEGAL_UPDATED}</Text>
   <Text selectable style={s.body}>{SUPPORT_EMAIL}</Text>
   <View style={s.actions}><PrimaryButton title="Email support" onPress={()=>void open(`mailto:${SUPPORT_EMAIL}?subject=Location%20Wrapped%20support`)} secondary /><PrimaryButton title="Open public page" onPress={()=>void open(`${SUPPORT_SITE}/${page}.html`)} secondary /></View>
   {content.sections.map(([title,text])=><View key={title}><Text style={s.heading}>{title}</Text><Text selectable style={s.body}>{text}</Text></View>)}
  </ScrollView></SafeAreaView></Modal>;
}
const s=StyleSheet.create({root:{flex:1,backgroundColor:colors.bg},close:{padding:16},content:{padding:24,paddingBottom:50},title:{color:colors.text,fontSize:30,fontWeight:'900'},heading:{color:colors.text,fontSize:20,fontWeight:'800',marginTop:28},body:{color:colors.muted,fontSize:16,lineHeight:24,marginTop:10},actions:{gap:10,marginTop:18}});
